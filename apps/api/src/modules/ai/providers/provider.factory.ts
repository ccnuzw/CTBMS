import { Injectable } from '@nestjs/common';
import { IAIProvider } from './base.provider';
import { GoogleProvider } from './google.provider';
import { OpenAIProvider } from './openai.provider';
import { AIProvider } from '@packages/types';

@Injectable()
export class AIProviderFactory {
  private providers: Map<AIProvider, IAIProvider> = new Map();

  constructor() {
    this.providers.set('google', new GoogleProvider());
    this.providers.set('openai', new OpenAIProvider());
    // initialize other providers here
  }

  getProvider(providerType: AIProvider): IAIProvider {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new Error(`Unsupported AI Provider: ${providerType}`);
    }
    return provider;
  }
}
