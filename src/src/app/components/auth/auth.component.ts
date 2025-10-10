import { Component, OnInit } from '@angular/core';

import { FloatLabelModule } from 'primeng/floatlabel';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { FocusTrapModule } from 'primeng/focustrap';
import { AuthParams, AuthService } from '../../services/auth.service';
import { MessageModule } from 'primeng/message';
import { HttpErrorResponse } from '@angular/common/http';
import { SkeletonModule } from 'primeng/skeleton';
import { take } from 'rxjs';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    FloatLabelModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    SkeletonModule,
    FocusTrapModule,
    MessageModule,
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
        if (!data.access_token) {
          this.error = 'Authentication failed';
          return;
        }
        this.router.navigateByUrl(this.redirectURL);
      },
      error: () => {
        this.authForm.reset();
      },
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
