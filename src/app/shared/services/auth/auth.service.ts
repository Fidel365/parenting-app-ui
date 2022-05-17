import { Injectable } from "@angular/core";
import { Auth, authState, User } from "@angular/fire/auth";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { BehaviorSubject } from "rxjs";
import { first, filter } from "rxjs/operators";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private authUser$ = new BehaviorSubject<User | null>(null);

  constructor(private auth: Auth) {
    this.addAuthListeners();
  }

  /** Return a promise that resolves after a signed in user defined */
  public async waitForSignInComplete() {
    return this.authUser$
      .pipe(
        filter((value?: User | null) => !!value),
        first()
      )
      .toPromise();
  }

  public async signInWithGoogle() {
    return FirebaseAuthentication.signInWithGoogle();
  }

  public async signOut() {
    return FirebaseAuthentication.signOut();
  }

  public async getCurrentUser() {
    const { user } = await FirebaseAuthentication.getCurrentUser();
    return user;
  }

  /** Listen to auth state changes and update local subject accordingly */
  private addAuthListeners() {
    authState(this.auth).subscribe((user) => {
      this.authUser$.next(user);
    });
  }
}
