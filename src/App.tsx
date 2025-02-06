import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import IdleRPG from './IdleRpg';
import { Box } from '@chakra-ui/react';

export function App() {
  return (
    <ErrorBoundary>
      <Box id="game-wrapper">
        <IdleRPG />
      </Box>
    </ErrorBoundary>
  );
}