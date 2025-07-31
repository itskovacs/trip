import { Component } from "@angular/core";

import { FloatLabelModule } from "primeng/floatlabel";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { InputTextModule } from "primeng/inputtext";
import { ButtonModule } from "primeng/button";
import { FocusTrapModule } from "primeng/focustrap";
import { AuthParams, AuthService, Token } from "../../services/auth.service";
import { MessageModule } from "primeng/message";
import { HttpErrorResponse } from "@angular/common/http";
import { SkeletonModule } from "primeng/skeleton";

@Component({
  selector: "app-auth",
  standalone: true,
  imports: [
    FloatLabelModule,
    ReactiveFormsModule,
    ButtonModule,
    FormsModule,
    InputTextModule,
    SkeletonModule,
    FocusTrapModule,
    MessageModule,
  ],
  templateUrl: "./auth.component.html",
  styleUrl: "./auth.component.scss",
})
export class AuthComponent {
  private redirectURL: string;
  authParams: AuthParams | undefined;
  authForm: FormGroup;
  error: string = "";
  isRegistering: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private fb: FormBuilder,
  ) {
    this.route.queryParams.subscribe((params) => {
      if (!Object.keys(params).length) return;
      const code = params["code"];
      const state = params["state"];
      if (code && state) {
        this.authService.oidcLogin(code, state).subscribe({
          next: (data) => {
            if (!data.access_token) {
              this.error = "Authentication failed";
              return;
            }
            this.router.navigateByUrl(this.redirectURL);
          },
        });
      }
    });

    // Timeout to handle race condition
    setTimeout(() => {
      this.authService.authParams().subscribe({
        next: (params) => (this.authParams = params),
      });
    }, 100);

    this.redirectURL =
      this.route.snapshot.queryParams["redirectURL"] || "/home";

    this.authForm = this.fb.group({
      username: ["", { validators: Validators.required }],
      password: ["", { validators: Validators.required }],
    });
  }

  auth_or_register() {
    if (this.isRegistering) this.register();
    else this.authenticate();
  }

  register(): void {
    this.error = "";
    if (this.authForm.valid) {
      this.authService.register(this.authForm.value).subscribe({
        next: () => {
          this.router.navigateByUrl(this.redirectURL);
        },
        error: (err: HttpErrorResponse) => {
          this.authForm.reset();
          this.error = err.error.detail;
        },
      });
    }
  }

  authenticate(): void {
    this.error = "";
    if (this.authParams?.oidc) {
      window.location.replace(this.authParams.oidc);
    }

    this.authService.login(this.authForm.value).subscribe({
      next: (data) => {
        if (!data.access_token) {
          this.error = "Authentication failed";
          return;
        }
        this.router.navigateByUrl(this.redirectURL);
      },
      error: () => {
        this.authForm.reset();
      },
    });
  }
}
