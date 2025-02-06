import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { ChevronRight } from 'lucide-react';

interface BattleLogProps {
  logs: string[];
}

export function BattleLog({ logs }: BattleLogProps) {
  return (
    <Box 
      bg="white" 
      p={4} 
      borderRadius="xl" 
      maxHeight="40" 
      overflowY="auto" 
      width="full"
      borderWidth="1px"
      borderColor="gray.200"
      css={{
        '&::-webkit-scrollbar': {
          width: '4px',
        },
        '&::-webkit-scrollbar-track': {
          width: '6px',
          background: 'gray.50',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'red.200',
          borderRadius: 'full',
        },
      }}
    >
      {logs.map((log, index) => (
        <Text 
          key={index} 
          fontSize="sm" 
          py={1}
          color={
            log.includes('defeated') ? 'green.600' : 
            log.includes('damage') ? 'red.600' : 
            log.includes('earned') ? 'purple.600' :
            'gray.700'
          }
          display="flex"
          alignItems="center"
        >
          <ChevronRight className="h-4 w-4 mr-1" />
          {log}
        </Text>
      ))}
    </Box>
  );
}