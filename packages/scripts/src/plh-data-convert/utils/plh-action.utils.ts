import { FlowTypes } from "../../../types";
import { booleanStringToBoolean } from "../../utils";
/**
 * Convert action_list string to row action object, e.g.
 *
 * string: `"click | set_value | hide_intro:true"`
 *
 * parsed:
 * ```
 * {
 *    action_id: "set_value",
 *    args: ["hide_intro","true"]
 * }
 * ```
 */
export function parsePLHActionString(actionString: string): FlowTypes.TemplateRowAction {
  const _raw = actionString;
  actionString = _handleTextExceptions(actionString);
  // ensure action starts with named trigger (default 'click')
  // TODO - CC 2021-05-17 - the list is growing long and non-specific, ideally should remove method
  // altogether and find better way to enforce action triggers
  const actionTriggers: { [trigger in FlowTypes.TemplateRowActionTrigger]: boolean } = {
    audio_end: true,
    audio_first_start: true,
    audio_pause: true,
    audio_play: true,
    changed: true,
    click: true,
    completed: true,
    uncompleted: true,
    nav_resume: true,
  };
  if (!Object.keys(actionTriggers).find((t) => actionString.startsWith(t))) {
    actionString = `click | ${actionString}`;
  }
  const _cleaned = actionString;
  // This was causing an error

  // CC 2021-03-27 - Above comment from Michael likely due to intentional catch of unparsed lists ';'
  // which this commit fixes. Should review in future

  // const _parsed = parsePLHString(actionString);
  const parts = actionString.split("|").map((s) => s.trim());
  const trigger = parts[0] as any;
  // 3+ string format {trigger} | {action_id} | {arg[]}
  // e.g.             `click    | track_event | name:event_1, value:hello`
  // e.g.             `click    | set_local   | some_key:some_value`

  // WiP - Proposed future syntax for processing complex args as key-value pairs
  // Breaking changes - needs thorough review before implementation

  // if (parts[2]) {
  //   const action_id = parts[1] as any;
  //   const args = {} as any;
  //   parts[2]
  //     .split(",")
  //     .map((arg) => arg.trim())
  //     .forEach((arg) => {
  //       const [key, value] = arg.split(":").map((v) => v.trim());
  //       args[key] = value;
  //     });
  //   return { trigger, action_id, args, _raw, _cleaned };
  // }

  // 2-part string format {trigger} | {action_id}:  {arg}
  // e.g.                 `completed    | emit:     completed
  if (parts[1]) {
    let [action_id, ...args] = parts[1].split(":").map((s) => s.trim()) as any;
    // ensure any boolean values are parsed correctly
    args = args.map((arg) => booleanStringToBoolean(arg));
    return { trigger, action_id, args, _raw, _cleaned };
    // single string format {trigger}
  } else {
    return { trigger, action_id: null, args: [], _raw, _cleaned };
  }
  /* let [[trigger], [action_id, ...args]] = _parsed as any[];
  // when responding to actions the action_id is actually the emitted name, so move to args
  if (trigger === "respond_to_action") {
    args.unshift(action_id);
    action_id = "emit";
  }
  return { trigger, action_id, args, _raw, _cleaned }; */
}

/**
 * some common authoring scenarios have been reduced to single keywords for ease-of-authoring
 * replace these with full specifications
 */
function _handleTextExceptions(text: string) {
  // a maximum of 1 replacement will be made, so order in terms of specifivity
  const shorthandReplacements = {
    exit: "emit | exit",
    mark_as_complete: "emit | complete",
    mark_as_skipped: "emit | skipped",
  };
  Object.entries(shorthandReplacements).some(([original, replacement]) => {
    // use a regular expression to prevent matching words that have additional content before
    // e.g. app_launch should not match on first_app_launch (start of string regex)
    const regex = new RegExp(`^${original}`);
    text = text.replace(regex, replacement);
    // if a match has been found return a true value so that future matches are not made
    // (e.g. prevent app_launch match running after first_launch match)
    return regex.test(text);
  });
  return text;
}
