import { Component, OnInit } from '@angular/core';

import { FloatLabelModule } from 'primeng/floatlabel';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { FocusTrapModule } from 'primeng/focustrap';
import { AuthParams, AuthService, TOTPRequired, Token } from '../../services/auth.service';
import { MessageModule } from 'primeng/message';
import { HttpErrorResponse } from '@angular/common/http';
import { SkeletonModule } from 'primeng/skeleton';
import { InputOtpModule } from 'primeng/inputotp';
import { take } from 'rxjs';

@Component({
  selector: 'app-auth',
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
    InputOtpModule,
  ],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss',
})
export class AuthComponent implements OnInit {
  readonly redirectURL: string;
  authParams: AuthParams | undefined;
  authForm: FormGroup;
  error: string | undefined;
  isRegistering: boolean = false;
  pendingOTP: string = '';
  otp: string = '';
  username: string = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private fb: FormBuilder,
  ) {
    this.redirectURL = this.route.snapshot.queryParams['redirectURL'] || '/home';

    this.authForm = this.fb.group({
      username: ['', { validators: Validators.required }],
      password: ['', { validators: Validators.required }],
    });
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(take(1)).subscribe((params) => {
      const code = params['code'];
      const state = params['state'];
      if (code && state) {
        this.authService.oidcLogin(code, state).subscribe({
          next: (data) => {
            if (!data.access_token) {
              this.error = 'Authentication failed';
              return;
            }
            this.router.navigateByUrl(this.redirectURL);
          },
          error: (err: HttpErrorResponse) => {
            this.error = err.error.detail || 'Login failed, check console for details';
          },
        });
      } else {
        this.getAuthParams();
      }
    });
  }

  onKeypressEnter() {
    if (this.isRegistering) this.register();
    else this.authenticate();
  }

  register(): void {
    this.error = undefined;
    if (this.authForm.valid) {
      this.authService.register(this.authForm.value).subscribe({
        next: () => {
          this.router.navigateByUrl(this.redirectURL);
        },
        error: (err: HttpErrorResponse) => {
          this.authForm.reset();
          this.error = err.error.detail || 'Registration failed, check console for details';
        },
      });
    }
  }

  authenticate(): void {
    this.error = undefined;
    if (this.authParams?.oidc) {
      window.location.replace(this.authParams.oidc);
    }

    this.authService.login(this.authForm.value).subscribe({
      next: (data) => {
        if ((data as Token)?.access_token) this.router.navigateByUrl(this.redirectURL);

        // If we're here, it means it's OTP time
        this.username = (data as TOTPRequired).username;
        this.pendingOTP = (data as TOTPRequired).pending_code;
        this.authForm.reset();
      },
      error: () => {
        this.authForm.reset();
      },
    });
  }

  verifyTOTP(): void {
    this.error = '';
    this.authService.verify_totp(this.username, this.pendingOTP, this.otp).subscribe({
      next: (token) => {
        if (token) this.router.navigateByUrl(this.redirectURL);
      },
      error: () => (this.otp = ''),
    });
  }

  getAuthParams() {
    this.authService
      .authParams()
      .pipe(take(1))
      .subscribe({
        next: (params) => (this.authParams = params),
      });
  }
}
