import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { AnimModalComponent } from './anim-modal/anim-modal.component';

@Component({
  selector: 'plh-goals',
  templateUrl: './goals.page.html',
  styleUrls: ['./goals.page.scss'],
  encapsulation: ViewEncapsulation.None
})
export class GoalsPage implements OnInit {

  constructor(private modalController: ModalController) { }

  ngOnInit() {
  }

  async openRewardModal() {
    const modal = await this.modalController.create({
      cssClass: "anim-slide-up-modal",
      component: AnimModalComponent,
      componentProps: {
        id: "trophy",
        title: "Congratulations!"
      }
    });
    modal.present();
  }

}
