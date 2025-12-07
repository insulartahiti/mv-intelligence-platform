'use server';

import { ChatService } from '@/lib/chat/service';

const chatService = new ChatService();

export async function getUserConversations(userId: string) {
  try {
    return await chatService.getUserConversations(userId);
  } catch (error) {
    console.error('Error fetching user conversations:', error);
    return [];
  }
}

export async function getConversationHistory(conversationId: string) {
  try {
    return await chatService.getHistory(conversationId);
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    return [];
  }
}
