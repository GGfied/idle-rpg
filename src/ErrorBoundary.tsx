import React, { Component, ErrorInfo, ReactNode } from 'react';
import { 
  Box, 
  VStack, 
  Heading, 
  Text, 
  Button,
  Code,
  useToast
} from '@chakra-ui/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Box 
          minHeight="100vh" 
          width="100%" 
          bg="gray.100" 
          p={4}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <VStack 
            spacing={6} 
            bg="white" 
            p={8} 
            borderRadius="xl" 
            boxShadow="xl"
            maxW="600px"
            width="full"
          >
            <Heading color="red.500">Oops! Something went wrong</Heading>
            <Text align="center">
              The game encountered an error and needs to be restarted.
            </Text>
            {this.state.error && (
              <Code p={4} borderRadius="md" width="full" bg="gray.50">
                {this.state.error.toString()}
              </Code>
            )}
            <Button 
              colorScheme="red"
              onClick={() => window.location.reload()}
            >
              Restart Game
            </Button>
          </VStack>
        </Box>
      );
    }

    return this.props.children;
  }
}