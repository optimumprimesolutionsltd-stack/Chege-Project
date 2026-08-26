import { Platform, type TextStyle } from 'react-native';
import type { WorkspaceNameStyle } from '@workspace/api-client-react';

export const WORKSPACE_NAME_STYLES: {
  value: WorkspaceNameStyle;
  label: string;
  description: string;
}[] = [
  { value: 'plain', label: 'Classic', description: 'Clean and familiar' },
  { value: 'italic', label: 'Flowing', description: 'Soft italic emphasis' },
  { value: 'bold', label: 'Strong', description: 'Confident and playful' },
  { value: 'serif', label: 'Storybook', description: 'Warm serif character' },
];

export function workspaceNameTextStyle(nameStyle?: WorkspaceNameStyle): TextStyle {
  switch (nameStyle) {
    case 'italic':
      return { fontFamily: 'Inter_600SemiBold', fontStyle: 'italic' };
    case 'bold':
      return { fontFamily: 'Inter_700Bold', fontWeight: '700', letterSpacing: -0.2 };
    case 'serif':
      return { fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }), fontWeight: '700' };
    default:
      return { fontFamily: 'Inter_600SemiBold' };
  }
}

export function workspaceIdentityText(
  workspace: { emoji?: string | null; name: string },
  fallback: string,
): string {
  return `${workspace.emoji ? `${workspace.emoji} ` : ''}${workspace.name.trim() || fallback}`;
}