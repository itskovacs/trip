import { Component, inject, signal } from '@angular/core';
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
export class AuthComponent {
  authService: AuthService;
  router: Router;
  route: ActivatedRoute;
  fb: FormBuilder;

  authParams = signal<AuthParams | null>(null);
  error = signal<string | null>(null);
  isRegistering = signal(false);
  pendingOTP = signal('');
  magicToken = signal<string | null>(null);

  authForm: FormGroup;
  otp = '';
  pendingUsername = '';
  redirectURL = '';

  constructor() {
    this.authService = inject(AuthService);
    this.router = inject(Router);
    this.route = inject(ActivatedRoute);
    this.fb = inject(FormBuilder);

    this.redirectURL = this.route.snapshot.queryParams['redirectURL'] || '/home';

    this.authForm = this.fb.group({
      username: [
        '',
        {
          validators: [
            Validators.required,
            Validators.minLength(1),
            Validators.maxLength(19),
            Validators.pattern(/^[a-zA-Z0-9_-]+$/),
          ],
        },
      ],
      password: ['', { validators: Validators.required }],
    });

    this.route.queryParams.pipe(take(1)).subscribe((params) => {
      const { code, state, magicToken } = params;

      if (code && state) {
        this.oidcLogin(code, state);
      } else {
        if (magicToken) {
          this.magicToken.set(magicToken);
          this.isRegistering.set(true);
        }
        this.loadAuthParams();
      }
    });
  }

  oidcLogin(code: string, state: string): void {
    this.authService
      .oidcLogin(code, state)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          if (!data.access_token) {
            this.error.set('Authentication failed');
            return;
          }
          this.router.navigateByUrl(this.redirectURL);
        },
        error: (err: HttpErrorResponse) =>
          this.error.set(err.error.detail || 'Login failed, check console for details'),
      });
  }

  loadAuthParams(): void {
    this.authService
      .authParams()
      .pipe(take(1))
      .subscribe({
        next: (params) => {
          this.authParams.set(params);
          if (params.oidc) {
            this.magicToken.set(null);
            this.isRegistering.set(false);
          }
        },
      });
  }

  onKeypressEnter(): void {
    this.isRegistering() ? this.register() : this.authenticate();
  }

  register(): void {
    this.error.set(null);
    if (!this.authForm.valid) return;

    this.authService
      .register(this.authForm.value as { username: string; password: string }, this.magicToken() ?? undefined)
      .pipe(take(1))
      .subscribe({
        next: () => this.router.navigateByUrl(this.redirectURL),
        error: (err: HttpErrorResponse) => {
          this.authForm.reset();
          this.error.set(err.error.detail || 'Registration failed, check console for details');
        },
      });
  }

  authenticate(): void {
    this.error.set(null);

    const params = this.authParams();
    if (params?.oidc) {
      window.location.replace(params.oidc);
      return;
    }

    this.authService
      .login(this.authForm.value as { username: string; password: string })
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          if ((data as Token)?.access_token) {
            this.router.navigateByUrl(this.redirectURL);
            return;
          }
          this.pendingUsername = (data as TOTPRequired).username;
          this.pendingOTP.set((data as TOTPRequired).pending_code);
          this.authForm.reset();
        },
        error: () => this.authForm.reset(),
      });
  }

  verifyTOTP(): void {
    this.error.set('');
    this.authService
      .verify_totp(this.pendingUsername, this.pendingOTP(), this.otp)
      .pipe(take(1))
      .subscribe({
        next: (token) => {
          if (token) this.router.navigateByUrl(this.redirectURL);
        },
        error: () => (this.otp = ''),
      });
  }
}
