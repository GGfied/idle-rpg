import React from 'react'
import ReactDOM from 'react-dom/client'
import { ChakraProvider, extendTheme } from '@chakra-ui/react'
import { App } from './App'
import './global.css'

// Create a custom theme
const theme = extendTheme({
  config: {
    initialColorMode: 'light',
    useSystemColorMode: false,
  },
  styles: {
    global: {
      body: {
        bg: 'gray.100',
        color: 'gray.800',
      }
    }
  }
});

// Make sure the root element exists
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Failed to find the root element');
  throw new Error('Failed to find the root element');
}

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ChakraProvider theme={theme}>
        <App />
      </ChakraProvider>
    </React.StrictMode>,
  );
} catch (error) {
  console.error('Error during React initialization:', error);
  throw error;
}