import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, ReplaySubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { UtilsService } from './utils.service';

export interface Token {
  refresh_token: string;
  access_token: string;
}

export interface AuthParams {
  register_enabled: boolean;
  oidc?: string;
}

const JWT_TOKEN = 'TRIP_AT';
const REFRESH_TOKEN = 'TRIP_RT';
const JWT_USER = 'TRIP_USER';

@Injectable({ providedIn: 'root' })
export class AuthService {
  public readonly apiBaseUrl: string;
  private refreshInProgressLock$: ReplaySubject<Token> | null = null;

  constructor(
    private httpClient: HttpClient,
    private router: Router,
    private apiService: ApiService,
    private utilsService: UtilsService,
  ) {
    this.apiBaseUrl = this.apiService.apiBaseUrl;
  }

  set loggedUser(user: string) {
    localStorage.setItem(JWT_USER, user);
  }

  get loggedUser(): string {
    return localStorage.getItem(JWT_USER) ?? '';
  }

  set accessToken(token: string) {
    localStorage.setItem(JWT_TOKEN, token);
  }

  get accessToken(): string {
    return localStorage.getItem(JWT_TOKEN) ?? '';
  }

  set refreshToken(token: string) {
    localStorage.setItem(REFRESH_TOKEN, token);
  }

  get refreshToken(): string {
    return localStorage.getItem(REFRESH_TOKEN) ?? '';
  }

  authParams(): Observable<AuthParams> {
    return this.httpClient.get<AuthParams>(this.apiBaseUrl + '/auth/params');
  }

  storeTokens(tokens: Token): void {
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
  }

  isLoggedIn(): Observable<boolean> {
    if (this.loggedUser) return of(true);
    if (this.accessToken) return of(true);
    return of(false);
  }

  refreshAccessToken(): Observable<Token> {
    if (this.refreshInProgressLock$) {
      return this.refreshInProgressLock$.asObservable();
    }

    this.refreshInProgressLock$ = new ReplaySubject(1);

    this.httpClient
      .post<Token>(this.apiBaseUrl + '/auth/refresh', {
        refresh_token: this.refreshToken,
      })
      .pipe(
        tap((tokens: Token) => {
          this.accessToken = tokens.access_token;
          this.refreshInProgressLock$?.next(tokens);
          this.refreshInProgressLock$?.complete();
          this.refreshInProgressLock$ = null;
        }),
      )
      .subscribe({
        error: (err) => {
          this.refreshInProgressLock$?.error(err);
          this.refreshInProgressLock$ = null;
        },
      });

    return this.refreshInProgressLock$.asObservable();
  }

  login(authForm: { username: string; password: string }): Observable<Token> {
    return this.httpClient.post<Token>(this.apiBaseUrl + '/auth/login', authForm).pipe(
      tap((tokens: Token) => {
        this.loggedUser = authForm.username;
        this.storeTokens(tokens);
      }),
    );
  }

  register(authForm: { username: string; password: string }): Observable<Token> {
    return this.httpClient.post<Token>(this.apiBaseUrl + '/auth/register', authForm).pipe(
      tap((tokens: Token) => {
        this.loggedUser = authForm.username;
        this.storeTokens(tokens);
      }),
    );
  }

  oidcLogin(code: string, state: string): Observable<Token> {
    return this.httpClient.post<Token>(this.apiBaseUrl + '/auth/oidc/login', { code, state }).pipe(
      tap((data: any) => {
        if (data.access_token && data.refresh_token) {
          this.loggedUser = this._getTokenUsername(data.access_token);
          this.storeTokens(data);
        }
      }),
    );
  }

  logout(custom_msg: string = '', is_error = false): void {
    this.loggedUser = '';
    this.removeTokens();

    if (custom_msg) {
      if (is_error) {
        this.utilsService.toast('error', 'You must be authenticated', custom_msg);
      } else {
        this.utilsService.toast('success', 'Success', custom_msg);
      }
    }

    this.router.navigate(['/auth']);
  }

  private removeTokens(): void {
    localStorage.removeItem(JWT_TOKEN);
    localStorage.removeItem(REFRESH_TOKEN);
    localStorage.removeItem(JWT_USER);
  }

  isTokenExpired(token: string, offsetSeconds?: number): boolean {
    // Return if there is no token
    if (!token || token === '') {
      return true;
    }

    // Get the expiration date
    const date = this._getTokenExpirationDate(token);
    offsetSeconds = offsetSeconds || 0;

    if (date === null) {
      return true;
    }

    // Check if the token is expired
    return !(date.valueOf() > new Date().valueOf() + offsetSeconds * 1000);
  }

  private _b64DecodeUnicode(str: any): string {
    return decodeURIComponent(
      Array.prototype.map
        .call(this._b64decode(str), (c: any) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  }

  private _b64decode(str: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';

    str = String(str).replace(/=+$/, '');

    if (str.length % 4 === 1) {
      throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
    }

    /* eslint-disable */
    for (
      let bc = 0, bs: any, buffer: any, idx = 0;
      (buffer = str.charAt(idx++));
      ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
        ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
        : 0
    ) {
      buffer = chars.indexOf(buffer);
    }
    /* eslint-enable */

    return output;
  }

  private _urlBase64Decode(str: string): string {
    let output = str.replace(/-/g, '+').replace(/_/g, '/');
    switch (output.length % 4) {
      case 0: {
        break;
      }
      case 2: {
        output += '==';
        break;
      }
      case 3: {
        output += '=';
        break;
      }
      default: {
        throw Error('Illegal base64url string!');
      }
    }
    return this._b64DecodeUnicode(output);
  }

  private _getTokenUsername(token: string): string {
    const decodedToken = this._decodeToken(token);

    if (decodedToken === null) {
      return '';
    }

    if (!decodedToken.hasOwnProperty('sub')) {
      return '';
    }

    return decodedToken.sub;
  }

  private _decodeToken(token: string): any {
    if (!token) {
      return null;
    }

    const parts = token.split('.');

    if (parts.length !== 3) {
      return null;
    }

    const decoded = this._urlBase64Decode(parts[1]);

    if (!decoded) {
      return null;
    }

    return JSON.parse(decoded);
  }

  private _getTokenExpirationDate(token: string): Date | null {
    const decodedToken = this._decodeToken(token);

    if (decodedToken === null) {
      return null;
    }

    if (!decodedToken.hasOwnProperty('exp')) {
      return null;
    }

    const date = new Date(0);
    date.setUTCSeconds(decodedToken.exp);

    return date;
  }
}
