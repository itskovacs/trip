import { Directive, ElementRef, HostBinding, HostListener, inject, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Directive({
  selector: '[appNumber]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NumberInputDirective),
      multi: true,
    },
  ],
})
export class NumberInputDirective implements ControlValueAccessor {
  @Input() min?: number;
  @Input() max?: number;
  @Input() maxDecimals = 0;

  @HostBinding('attr.inputmode')
  get inputMode(): string {
    return this.maxDecimals > 0 ? 'decimal' : 'numeric';
  }

  private el: ElementRef<HTMLInputElement> = inject(ElementRef);
  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('input')
  onInput(): void {
    const input = this.el.nativeElement;
    const raw = input.value;
    const sanitized = this.sanitize(raw);
    if (sanitized !== raw) {
      const prefixLen = this.sanitize(raw.slice(0, input.selectionStart ?? raw.length)).length;
      const cursor = Math.min(sanitized.length, Math.max(0, prefixLen));
      input.value = sanitized;
      input.setSelectionRange(cursor, cursor);
    }
    this.onChange(this.parse(sanitized));
  }

  @HostListener('blur')
  onBlur(): void {
    this.onTouched();
    const input = this.el.nativeElement;
    let value = this.parse(this.sanitize(input.value));
    if (value !== null) {
      if (this.min !== undefined && value < this.min) value = this.min;
      if (this.max !== undefined && value > this.max) value = this.max;
    }
    input.value = this.format(value);
    this.onChange(value);
  }

  writeValue(value: number | null): void {
    this.el.nativeElement.value = this.format(value);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.nativeElement.disabled = isDisabled;
  }

  private sanitize(raw: string): string {
    const allowMinus = this.min === undefined || this.min < 0;
    let value = raw.replace(allowMinus ? /[^0-9,.-]/g : /[^0-9,.]/g, '');
    value = (allowMinus && value[0] === '-' ? '-' : '') + value.replace(/-/g, '');

    if (this.maxDecimals <= 0) return value.replace(/[,.]/g, '');

    // Comma and dot can each be a decimal separator or a thousands separator
    // depending on locale/source (e.g. "1,234.56" vs "1.234,56"). Whichever
    // of the two appears last is treated as the decimal point; if it repeats,
    // it can only be a grouping separator (a number has one decimal point).
    const lastDot = value.lastIndexOf('.');
    const lastComma = value.lastIndexOf(',');
    let decimalSep = lastDot > lastComma ? '.' : lastComma > lastDot ? ',' : '';
    if (decimalSep && value.indexOf(decimalSep) !== value.lastIndexOf(decimalSep)) {
      decimalSep = '';
    }
    if (!decimalSep) return value.replace(/[,.]/g, '');

    const splitAt = decimalSep === '.' ? lastDot : lastComma;
    const intPart = value.slice(0, splitAt).replace(/[,.]/g, '');
    const decPart = value
      .slice(splitAt + 1)
      .replace(/[,.]/g, '')
      .slice(0, this.maxDecimals);
    return `${intPart}.${decPart}`;
  }

  private parse(value: string): number | null {
    if (value === '' || value === '-' || value === '.' || value === '-.') return null;
    const n = parseFloat(value);
    return Number.isNaN(n) ? null : n;
  }

  private format(value: number | null): string {
    if (value === null) return '';
    if (this.maxDecimals <= 0) return String(Math.round(value));
    return String(Number(value.toFixed(this.maxDecimals)));
  }
}
