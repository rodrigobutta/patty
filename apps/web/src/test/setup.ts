// Las pruebas corren en castellano (jsdom dice "en-US").
Object.defineProperty(navigator, 'language', { value: 'es-AR', configurable: true });
import '@testing-library/jest-dom/vitest';
