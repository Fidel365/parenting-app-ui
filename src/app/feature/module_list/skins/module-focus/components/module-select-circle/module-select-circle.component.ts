import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FlowTypes } from "src/app/shared/model/flowTypes";

type Module = FlowTypes.Module_listRow;

type ModuleCircle = {
  id: string,
  left: string,
  top: string,
  cssClass: string
}

@Component({
  selector: 'plh-module-select-circle',
  templateUrl: './module-select-circle.component.html',
  styleUrls: ['./module-select-circle.component.scss'],
})
export class ModuleSelectCircleComponent implements OnChanges {

  @Input() modules: Module[];
  @Input() currentModule: Module;
  outerModuleCircles: ModuleCircle[] = [];

  innerCircleDiameter: number = 100; // Number in px
  outerCirclesDiameter: number = 50; // Number in percent of container

  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.modules && this.modules) {
      this.outerModuleCircles = this.modules
        .map((module, index) => {
          const angleRadians = Math.PI * 2 * (index + 1) / this.modules.length;
          const radius = 28;
          const x = 40 + radius * Math.sin(angleRadians);
          const y = 50 + radius * Math.cos(angleRadians);
          let cssClass = "outer-circle";
          if (module.id === this.currentModule.id) {
            cssClass += " current-module";
          }
          const diameter = this.outerCirclesDiameter;
          return {
            id: module.id,
            left: `calc(${x}% - ${diameter/2}px`,
            top: `calc(${y}% - ${diameter/2}px`,
            cssClass: cssClass
          };
        });
    }
  }



}
