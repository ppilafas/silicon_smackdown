/** @type {import('tailwindcss').Config} */
export default {
  // Every place a class string can appear, including constants.ts where
  // guest.avatarColor values (e.g. 'bg-indigo-500') live as data.
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './constants.ts',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
