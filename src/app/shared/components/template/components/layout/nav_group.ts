import { Component } from "@angular/core";
import { PLHAnimations } from "src/app/shared/animations";
import { FlowTypes } from "data-models";
import { hackAddRowWithDefaultActions } from "../../hacks";
import { TemplateLayoutComponent } from "./layout";
import { isObject } from "src/app/shared/utils/utils";
import { TemplateFieldService } from "../../services/template-field.service";

@Component({
  selector: "plh-tmpl-nav-group",
  animations: PLHAnimations.fadeEntryExit,
  template: `
    <div class="nav-progress">
      <div
        *ngFor="let templateName of templateNames; index as i"
        class="nav-progress-part"
        [attr.data-seen]="i <= sectionIndex ? true : null"
        (click)="goToSection(i)"
      ></div>
    </div>
    <!-- Render placeholders for each section but omit content -->
    <div
      *ngFor="let templateName of templateNames; index as i"
      class="nav-section"
      [attr.data-selected]="sectionIndex === i ? true : null"
    >
      <plh-template-container
        *ngIf="sectionIndex === i"
        [name]="templateName"
        [templatename]="templateName"
        [parent]="parent"
        [row]="containerRow"
        @fadeEntryExit
      >
      </plh-template-container>
    </div>
  `,
  styles: [
    `
      :host {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .nav-section {
        display: flex;
        flex-direction: column;
        position: relative;
        /* sections not active are kept off-screen to avoid content height jump */
        right: 100vw;
      }
      .nav-section[data-selected] {
        flex: 1;
        right: unset;
      }
      .nav-progress {
        display: flex;
        flex-direction: row;
        justify-content: space-evenly;
        padding: 1em 0;
      }

      .nav-progress-part {
        height: 7px;
        flex: 1;
        margin: 0 2px;
        background-color: var(--ion-primary-color, #0d3f60);
        border-radius: var(--ion-border-radius-standard);
        max-width: 40px;
      }

      .nav-progress-part[data-seen] {
        background-color: var(--ion-primary-color, #f88923);
      }
    `,
  ],
})
export class NavGroupComponent extends TemplateLayoutComponent {
  templateNames: string[] = [];
  sectionIndex: number;

  /** Temp row to pass emit completed/uncompleted actions to parent */
  containerRow = hackAddRowWithDefaultActions();

  constructor(private templateFieldService: TemplateFieldService) {
    super();
  }

  modifyRowSetter(row: FlowTypes.TemplateRow) {
    if (Array.isArray(row?.value)) {
      // Check if value is an object referring to a whole data_list with a "template" column,
      // and if so, assign an array of the values of this column to templateNames
      const templateArray = [];
      if (row?.value.length === 1) {
        const dataObject = row?.value[0];
        if (isObject(dataObject)) {
          for (const property in dataObject) {
            if (dataObject[property].hasOwnProperty("template")) {
              templateArray.push(dataObject[property].template);
            }
          }
        }
      }
      if (templateArray.length > 0) {
        this.templateNames = templateArray;
      } else {
        this.templateNames = row.value;
      }
      row._debug_name = this.templateNames[this.sectionIndex];
      // only set the active section the first time value received
      // (handle via goToSection method internally for other cases)
      if (!this.sectionIndex) {
        this.sectionIndex = this.getActiveSectionIdx(row?.parameter_list?.progress_field);
      }
    }
    return row;
  }

  interceptTemplateContainerAction(action: FlowTypes.TemplateRowAction) {
    const { action_id, args } = action;
    // only allow actions to be processed by parent if last section
    if (action_id === "emit" && args[0] === "completed") {
      if (this.sectionIndex < this.templateNames.length - 1) {
        this.goToSection(this.sectionIndex + 1);
        return false;
      }
    }
    if (action_id === "emit" && args[0] === "uncompleted") {
      if (this.sectionIndex > 0) {
        this.goToSection(this.sectionIndex - 1).then();
        return false;
      }
    }
    // default process on parent
    return true;
  }

  /**
   * Function that will return Current Slider Index
   * @param progressField
   */
  getActiveSectionIdx(progressField: string): number {
    let result: number;
    const currentProgress = this.templateFieldService.getField(progressField);
    if (+currentProgress === 100) {
      result = 0;
      this.templateFieldService.setField(progressField, `${result}`);
      return result;
    }
    result = Math.floor((currentProgress * this.templateNames.length) / 100 - 1);
    return result > 0 ? result : 0;
  }

  /**
   * Function that will move forward or back to Section
   * @param index
   */
  async goToSection(index: number) {
    this.sectionIndex = index;
    this.scrollToTop();
    this._row._debug_name = this.templateNames[index];
    await this.updateSectionProgress();
  }

  /**
   * Function to Update Progress of Stepper
   */
  async updateSectionProgress() {
    //update the field provided in progress_variable to be equal to the max of it's current value
    //and the percentage of this.sectionIndex from this.templateNames.length. the value should
    //be an integer between 0 and 100 inclusive.
    const progressField = this._row.parameter_list["progress_field"];
    const progressFieldMaximum = this._row.parameter_list["max_progress_field"];

    if (progressField && progressField.indexOf("{{") < 0) {
      const currentPercentDone = Math.ceil(
        ((this.sectionIndex + 1) / this.templateNames.length) * 100
      );

      let maximumPercentDone: number;

      let currentMaximumPercentDone: number = Number.parseInt(
        this.templateFieldService.getField(progressFieldMaximum)
          ? this.templateFieldService.getField(progressFieldMaximum)
          : currentPercentDone
      );

      maximumPercentDone = Math.max(currentPercentDone, currentMaximumPercentDone);

      await this.parent.handleActions(
        [
          {
            action_id: "set_field",
            args: [progressField, "" + currentPercentDone],
            trigger: "completed",
            _triggeredBy: this._row,
          },
          {
            action_id: "set_field",
            args: [progressFieldMaximum, "" + maximumPercentDone],
            trigger: "completed",
            _triggeredBy: this._row,
          },
        ],
        this._row
      );
    } else {
      console.warn("No progress field", progressField);
    }
  }
}
