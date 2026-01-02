import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  icon, 
  className = '', 
  ...props 
}) => {
  const baseStyle = "flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 font-medium text-sm active:scale-95";
  
  const variants = {
    primary: "bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-200",
    secondary: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm",
    ghost: "text-slate-600 hover:bg-slate-100/50 hover:text-sky-600",
    danger: "bg-red-50 hover:bg-red-100 text-red-600",
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${className}`} 
      {...props}
    >
      {icon}
      {children}
    </button>
  );
};