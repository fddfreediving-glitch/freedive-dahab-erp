import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ErpSelect } from './erp-select';

type CountryDialOption = { country: CountryCode; name: string; code: string };

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryDialOptions: CountryDialOption[] = getCountries()
  .map((country) => ({
    country,
    name: regionNames.of(country) || country,
    code: `+${getCountryCallingCode(country)}`,
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

const defaultCountry: CountryCode = 'EG';

function splitPhone(value: string): { country: CountryCode; number: string } {
  const trimmed = value.trim();
  if (!trimmed.startsWith('+')) return { country: defaultCountry, number: trimmed };

  const match = countryDialOptions
    .filter((option) => trimmed.startsWith(option.code))
    .sort((left, right) => right.code.length - left.code.length)[0];
  if (!match) return { country: defaultCountry, number: trimmed.replace(/^\+\d{1,4}\s*/, '') };
  return { country: match.country, number: trimmed.slice(match.code.length).trim() };
}

type PhoneNumberInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  disabled?: boolean;
  'aria-label'?: string;
};

/** Phone input that stores a full international number while exposing a country-code picker. */
export function PhoneNumberInput({
  id,
  value,
  onChange,
  className = '',
  placeholder = 'Phone number',
  autoComplete,
  maxLength = 60,
  disabled,
  'aria-label': ariaLabel,
}: PhoneNumberInputProps) {
  const parsed = useMemo(() => splitPhone(value), [value]);
  const [country, setCountry] = useState<CountryCode>(parsed.country);
  const [number, setNumber] = useState(parsed.number);
  const lastEmittedValue = useRef<string | null>(null);

  useEffect(() => {
    if (lastEmittedValue.current === value) {
      lastEmittedValue.current = null;
      return;
    }
    setCountry(parsed.country);
    setNumber(parsed.number);
  }, [parsed, value]);

  const selectedCountry = countryDialOptions.find((option) => option.country === country) ?? countryDialOptions[0];
  const emitValue = (nextCountry: CountryCode, nextNumber: string) => {
    const nextValue = nextNumber.trim() ? `${countryDialOptions.find((option) => option.country === nextCountry)?.code ?? '+20'} ${nextNumber.trim()}` : '';
    lastEmittedValue.current = nextValue;
    onChange(nextValue);
  };

  return <div className={`flex min-w-0 items-stretch ${className}`}>
    <ErpSelect
      aria-label="Country calling code"
      className="!w-[5.25rem] min-w-0 shrink-0 rounded-r-none border-slate-300 bg-slate-100 px-2 text-slate-800 shadow-none hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      menuWidth={280}
      value={country}
      displayValue={selectedCountry.code}
      disabled={disabled}
      onChange={(event) => {
        const nextCountry = event.target.value as CountryCode;
        setCountry(nextCountry);
        emitValue(nextCountry, number);
      }}
    >
      {countryDialOptions.map((option) => <option key={option.country} value={option.country}>{option.name} ({option.code})</option>)}
    </ErpSelect>
    <input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete={autoComplete}
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      value={number}
      onChange={(event) => {
        const nextNumber = event.target.value;
        setNumber(nextNumber);
        emitValue(country, nextNumber);
      }}
      className={`min-w-0 flex-1 rounded-l-none rounded-r-lg border border-l-0 border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-900 ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    />
  </div>;
}
