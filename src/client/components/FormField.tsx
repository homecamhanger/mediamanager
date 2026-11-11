import React from 'react';

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
}

export const FormField: React.FC<FormFieldProps> = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-100"
    />
  </div>
);
