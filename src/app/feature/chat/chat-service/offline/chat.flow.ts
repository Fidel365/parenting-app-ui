import { Observable, of, BehaviorSubject } from "rxjs";
import { ChatMessage, ChatResponseOption, IRapidProMessage } from "../chat-msg.model";
import { convertFromRapidProMsg, convertRapidProAttachments } from "../message.converter";
import { ContactFieldService } from "./contact-field.service";
import { FlowStatusChange } from "./offline-chat.service";
import { RapidProFlowExport } from "./rapid-pro-export.model";
import { matchesCase } from "./router-case-matchers";

export interface ChatFlow {
  sendMessage(msg: ChatMessage): Observable<any>;
  messages$: BehaviorSubject<ChatMessage[]>;
  flowStatus$: BehaviorSubject<FlowStatusChange[]>;
}

export class RapidProOfflineFlow implements ChatFlow {
  name: string;
  nodesById: { [nodeUUID: string]: RapidProFlowExport.Node } = {};
  currentNode: RapidProFlowExport.Node;
  childFlowId: string = null;
  running = false;

  flowStepDelay = 200;
  sendMessageDelay = 1000;

  flowResults: { [resultName: string]: string } = {};

  constructor(
    protected flowObject: RapidProFlowExport.Flow,
    public messages$: BehaviorSubject<ChatMessage[]>,
    public flowStatus$: BehaviorSubject<FlowStatusChange[]>,
    public contactFieldService: ContactFieldService
  ) {
    console.log("Export object!", flowObject);
    this.name = flowObject.name;
    this.flowObject.nodes.forEach((node) => {
      this.nodesById[node.uuid] = node;
    });
  }

  public start() {
    if (!this.running) {
      this.running = true;
      this.enterNode(this.flowObject.nodes[0]);
    } else {
      console.warn(
        "Attempted to start flow that is already running ",
        this.flowObject.name,
        this.flowObject.uuid
      );
    }
  }

  public reset() {
    this.running = false;
  }

  private async enterNode(node: RapidProFlowExport.Node) {
    this.currentNode = node;
    console.log("Entered node id ", node.uuid, node);
    for (let action of node.actions) {
      if (action.type === "enter_flow") {
        if (action.flow) {
          this.childFlowId = action.flow.uuid;
          let flowEvents = this.flowStatus$.getValue();
          if (flowEvents.length > 0) {
            let latest = flowEvents[flowEvents.length - 1];
            if (latest.flowId !== action.flow.uuid) {
              flowEvents.push({
                flowId: action.flow.uuid,
                flowName: action.flow.name,
                status: "start",
              });
              console.log("Next on BS: child flow");
              this.flowStatus$.next(flowEvents);
            }
          }
        } else {
          console.error("Action was to enter_flow however no object for which flow to enter");
        }
      }
      if (action.type === "send_msg" && action.text) {
        await this.wait(this.sendMessageDelay);
        this.doSendMessageAction(action);
      }
      if (action.type === "set_contact_field") {
        this.doSetContactFieldAction(action);
      }
      if (action.type === "set_contact_name") {
        this.doSetContactNameAction(action);
      }
    }
    await this.wait();
    if (!node.router) {
      let firstExitWithDestination = node.exits.filter((exit) => exit.destination_uuid)[0];
      if (firstExitWithDestination) {
        console.log("Entered node by exiting from node with no router");
        this.enterNode(this.getNodeById(firstExitWithDestination.destination_uuid));
      } else {
        console.log("This should be flow completion");
        let flowEvents = this.flowStatus$.getValue();
        flowEvents.push({
          flowId: this.flowObject.uuid,
          flowName: this.flowObject.name,
          status: "completed",
        });
        this.running = false;
        this.flowStatus$.next(flowEvents);
      }
    } else {
      console.log("Router here?");
      if (!(node.router.operand && node.router.operand.indexOf("@input.") > -1)) {
        await this.useRouter(node);
      }
    }
  }

  private wait(delay = this.flowStepDelay): Promise<any> {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, delay);
    });
  }

  private convertToVariableName(name: string) {
    return name.toLowerCase().replace(" ", "_");
  }

  private useUserInputRouter(node: RapidProFlowExport.Node, incomingMsg: string) {
    if (node.router.result_name) {
      const fieldName = this.convertToVariableName(node.router.result_name);
      this.flowResults[fieldName] = incomingMsg;
    }
    let matchingCategoryId: string;
    for (let routerCase of node.router.cases) {
      if (matchesCase(routerCase, incomingMsg)) {
        matchingCategoryId = routerCase.category_uuid;
        break;
      }
    }
    if (matchingCategoryId) {
      this.exitUsingCategoryId(node, matchingCategoryId);
    } else if (node.router.default_category_uuid) {
      this.exitUsingCategoryId(node, node.router.default_category_uuid);
    } else {
      console.warn("Nothing matches for node ", node.uuid);
    }
  }

  private useSwitchRouter(node: RapidProFlowExport.Node, operandValue: string) {
    let matchingCategoryId: string;
    for (let routerCase of node.router.cases) {
      if (matchesCase(routerCase, operandValue)) {
        matchingCategoryId = routerCase.category_uuid;
        break;
      }
    }
    if (matchingCategoryId) {
      this.exitUsingCategoryId(node, matchingCategoryId);
    } else if (node.router.default_category_uuid) {
      this.exitUsingCategoryId(node, node.router.default_category_uuid);
    } else {
      console.warn("Nothing matches for node ", node.uuid);
    }
  }

  private async useRouter(node: RapidProFlowExport.Node) {
    if (node.router.type === "random") {
      this.exitAtRandom(node);
    } else {
      if (node.router.operand === "@child.run.status") {
        this.setupSubflowCompletionSubscription(node);
      } else {
        let variableValue = await this.parseMessageTemplate(node.router.operand);
        if (variableValue.startsWith("@")) {
          console.warn(
            "Switch router operand starts with @ ",
            node.router.operand,
            "This is likely a mistake and this operand type isn't supported"
          );
        }
        this.useSwitchRouter(node, variableValue);
      }
    }
  }

  private setupSubflowCompletionSubscription(node: RapidProFlowExport.Node) {
    for (let routerCase of node.router.cases) {
      if (routerCase.arguments && routerCase.arguments[0] === "completed") {
        let subscription = this.flowStatus$.subscribe((flowEvents) => {
          if (flowEvents.length > 0) {
            let latest = flowEvents[flowEvents.length - 1];
            if (latest.status === "completed" && latest.flowId === this.childFlowId) {
              console.log("Returning to parent flow after subflow completion");
              subscription.unsubscribe();
              this.childFlowId = null;
              this.exitUsingCategoryId(node, routerCase.category_uuid);
            }
          }
        });
      }
    }
  }

  private exitAtRandom(node: RapidProFlowExport.Node) {
    let randomIndex = this.getRandomInt(0, node.router.categories.length - 1);
    let randomCategory = node.router.categories[randomIndex];
    this.exitUsingCategoryId(node, randomCategory.uuid);
  }

  /**
   * Returns a random integer between min (inclusive) and max (inclusive).
   * The value is no lower than min (or the next integer greater than min
   * if min isn't an integer) and no greater than max (or the next integer
   * lower than max if max isn't an integer).
   * Using Math.round() will give you a non-uniform distribution!
   */
  private getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private exitUsingCategoryId(node: RapidProFlowExport.Node, matchingCategoryId: string) {
    let matchingCategory = node.router.categories.find((cat) => cat.uuid === matchingCategoryId);
    let matchingExit = node.exits.find((exit) => exit.uuid === matchingCategory.exit_uuid);
    console.log("Entered node via router category ", matchingCategory);
    this.enterNode(this.getNodeById(matchingExit.destination_uuid));
  }

  private async parseMessageTemplate(template: string): Promise<string> {
    console.log("template", template);
    let output: string = "" + template;

    let regexResult: RegExpExecArray;
    // Match Rapid Pro Contact fixed variables
    let contactVaraibleRegex = /@contact\.([0-9a-zA-Z\_]*)/gm;
    while ((regexResult = contactVaraibleRegex.exec(template)) !== null) {
      let fullMatch = regexResult[0];
      let fieldName = regexResult[1];
      output = output.replace(fullMatch, await this.contactFieldService.getContactField(fieldName));
    }

    // Match Rapid Pro Contact fields
    let contactFieldRegex = /@fields\.([0-9a-zA-Z\_]*)/gm;
    while ((regexResult = contactFieldRegex.exec(template)) !== null) {
      let fullMatch = regexResult[0];
      let fieldName = regexResult[1];
      output = output.replace(fullMatch, await this.contactFieldService.getContactField(fieldName));
    }

    // Match Result fields
    let resultFieldRegex = /@results\.([0-9a-zA-Z\_]*)/gm;
    while ((regexResult = resultFieldRegex.exec(template)) !== null) {
      let fullMatch = regexResult[0];
      let fieldName = regexResult[1];
      output = output.replace(fullMatch, this.flowResults[fieldName]);
      console.log("output", output);
    }

    return output;
  }

  private async doSendMessageAction(action: RapidProFlowExport.Action) {
    const messages = this.messages$.getValue();
    const text = await this.parseMessageTemplate(action.text);
    let parsedAttachmentUrls = await Promise.all(action.attachments.map(this.parseMessageTemplate));
    const rapidProMessage: IRapidProMessage = {
      message: text,
      message_id: action.uuid,
      title: "",
      type: "rapidpro",
      quick_replies: JSON.stringify(action.quick_replies ? action.quick_replies : []),
      attachments: parsedAttachmentUrls,
      wasTapped: false,
    };
    const newMessage = await convertFromRapidProMsg(rapidProMessage);
    messages.push(newMessage);
    this.messages$.next(messages);
  }

  private async doSetContactNameAction(action: RapidProFlowExport.Action) {
    if (action.name) {
      const nameParsed = await this.parseMessageTemplate(action.name);
      this.contactFieldService.setContactField("name", nameParsed);
    }
  }

  private async doSetContactFieldAction(action: RapidProFlowExport.Action) {
    if (action.field && action.field.key) {
      const valueParsed = await this.parseMessageTemplate(action.value);
      this.contactFieldService.setContactField(action.field.key, valueParsed);
    }
  }

  private getNodeById(uuid: string) {
    return this.nodesById[uuid];
  }

  public sendMessage(msg: ChatMessage) {
    if (
      this.currentNode &&
      this.currentNode.router &&
      this.currentNode.router.operand === "@input.text"
    ) {
      setTimeout(() => this.useUserInputRouter(this.currentNode, msg.text), 1000);
    }
    return of(true);
  }
}