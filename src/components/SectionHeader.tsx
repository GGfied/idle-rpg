import React from 'react';
import { HStack, Box, Heading } from '@chakra-ui/react';
import { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  icon: LucideIcon;
  color: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, icon: Icon, color }) => (
  <HStack 
    width="full" 
    bg={`${color}.100`} 
    p={4} 
    borderRadius="xl" 
    mb={4}
    borderBottom="4px solid"
    borderColor={`${color}.400`}
    boxShadow="sm"
  >
    <Box
      p={3}
      borderRadius="lg"
      bg={`${color}.200`}
      className="animate-pulse"
    >
      <Icon className={`h-6 w-6 text-${color}-600`} />
    </Box>
    <Heading size="lg" color={`${color}.700`}>{title}</Heading>
  </HStack>
);