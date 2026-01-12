# Provider Architecture Refactor Plan

## Current State (Problems)

Adding a new model provider to Chorus currently requires changes in **6+ different places**:

1. **`src/core/chorus/Models.ts`**
   - Add to `ProviderName` type union
   - Add to `ApiKeys` type
   - Add case to `getProvider()` switch statement
   - Add to `CONTEXT_LIMIT_PATTERNS`

2. **`src/core/utilities/ProxyUtils.ts`**
   - Add to `PROVIDER_TO_API_KEY` mapping
   - Add to `PROVIDER_DISPLAY_NAMES` mapping

3. **`src/ui/components/ui/provider-logo.tsx`**
   - Add case to `getLogoComponent()` switch statement

4. **`src/ui/components/ApiKeysForm.tsx`**
   - Add to hardcoded `providers` array

5. **`src-tauri/src/migrations.rs`**
   - Add SQL `INSERT` statements for each model (hardcoded)

6. **`src/core/chorus/ModelProviders/Provider*.ts`**
   - Create a new provider implementation file

### Additional Issues

- **Hardcoded models**: Models are defined in database migrations, requiring new migrations every time a model is added or deprecated
- **No dynamic model discovery**: Most providers have `/v1/models` endpoints that could be used to fetch available models
- **Scattered configuration**: Provider metadata (name, logo, API key URL, base URL) is spread across multiple files
- **Inconsistent patterns**: Some providers (OpenRouter, Ollama, LM Studio) have dynamic model fetching, while others (Anthropic, OpenAI, Google) are fully hardcoded

## Proposed Solution

### 1. Provider Registry

Create a single source of truth for provider configuration:

```typescript
// src/core/chorus/providers/registry.ts

interface ProviderConfig {
  id: string;                          // e.g., "kimi", "anthropic"
  displayName: string;                 // e.g., "Moonshot AI (Kimi)"
  apiKeyField: string;                 // field name in ApiKeys type
  apiKeyPlaceholder: string;           // e.g., "sk-..."
  apiKeyUrl: string;                   // URL to get API key
  baseUrl: string;                     // API base URL
  logo: ProviderLogo;                  // logo configuration
  contextLimitPattern: string;         // error pattern for context limits
  supportsModelDiscovery: boolean;     // whether /v1/models is available
  defaultModels?: ModelDefinition[];   // fallback if discovery unavailable
  providerClass: new () => IProvider;  // provider implementation class
}

const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  kimi: {
    id: "kimi",
    displayName: "Moonshot AI (Kimi)",
    apiKeyField: "kimi",
    apiKeyPlaceholder: "sk-...",
    apiKeyUrl: "https://platform.moonshot.ai/console/api-keys",
    baseUrl: "https://api.moonshot.ai/v1",
    logo: { type: "svg", path: "/kimi.svg" },
    contextLimitPattern: "context length",
    supportsModelDiscovery: true,
    providerClass: ProviderKimi,
  },
  // ... other providers
};
```

### 2. Dynamic Model Discovery

Implement a unified model discovery system:

```typescript
// src/core/chorus/providers/modelDiscovery.ts

interface ModelDiscoveryResult {
  models: Model[];
  source: "api" | "fallback" | "cache";
}

async function discoverModels(providerId: string): Promise<ModelDiscoveryResult> {
  const config = PROVIDER_REGISTRY[providerId];
  
  if (config.supportsModelDiscovery) {
    try {
      // Most providers use OpenAI-compatible /v1/models endpoint
      const models = await fetchModelsFromApi(config);
      await cacheModels(providerId, models);
      return { models, source: "api" };
    } catch (error) {
      // Fall back to cached or default models
      const cached = await getCachedModels(providerId);
      if (cached) return { models: cached, source: "cache" };
    }
  }
  
  return { models: config.defaultModels || [], source: "fallback" };
}
```

### 3. Base Provider Class

Create a base class for OpenAI-compatible providers (most providers use this format):

```typescript
// src/core/chorus/ModelProviders/BaseOpenAICompatibleProvider.ts

export class BaseOpenAICompatibleProvider implements IProvider {
  constructor(
    protected config: ProviderConfig,
    protected options?: ProviderOptions
  ) {}

  async streamResponse(params: StreamResponseParams): Promise<void> {
    const { apiKeys, modelConfig, ... } = params;
    
    const client = new OpenAI({
      baseURL: this.config.baseUrl,
      apiKey: apiKeys[this.config.apiKeyField],
      dangerouslyAllowBrowser: true,
    });
    
    // Common streaming logic...
  }
}

// Provider-specific implementations only override what's different
export class ProviderKimi extends BaseOpenAICompatibleProvider {
  constructor() {
    super(PROVIDER_REGISTRY.kimi);
  }
  
  // Override only if needed for provider-specific behavior
}
```

### 4. Auto-generated UI Components

Generate API key forms and provider logos from the registry:

```typescript
// src/ui/components/ApiKeysForm.tsx

function ApiKeysForm({ apiKeys, onApiKeyChange }) {
  // Generate from registry instead of hardcoding
  const providers = Object.values(PROVIDER_REGISTRY)
    .filter(p => p.apiKeyField) // exclude local providers
    .map(p => ({
      id: p.id,
      name: p.displayName,
      placeholder: p.apiKeyPlaceholder,
      url: p.apiKeyUrl,
    }));
  
  // ... rest of component
}
```

## Migration Strategy

### Phase 1: Create Registry (Non-breaking)
1. Create `PROVIDER_REGISTRY` with current providers
2. Refactor utility functions to read from registry
3. Keep existing code working

### Phase 2: Implement Model Discovery
1. Add model discovery for providers that support it
2. Cache discovered models in SQLite
3. Add periodic refresh mechanism

### Phase 3: Consolidate Provider Implementations
1. Create `BaseOpenAICompatibleProvider`
2. Migrate simple providers (Kimi, Grok, Perplexity) to use base class
3. Keep complex providers (Anthropic, Google) as custom implementations

### Phase 4: UI Refactor
1. Generate `ApiKeysForm` from registry
2. Generate provider logos from registry
3. Remove hardcoded provider lists

### Phase 5: Remove Hardcoded Models
1. Remove model INSERT statements from migrations
2. Implement model discovery for all providers
3. Add admin UI for managing model visibility

## Benefits After Refactor

- **Adding a new provider**: Single file with `ProviderConfig` + optional custom `IProvider`
- **Adding a new model**: Automatic via API discovery, or single config entry
- **Consistent behavior**: All providers follow same patterns
- **Easier testing**: Provider configs can be mocked easily
- **Better maintainability**: Single source of truth for provider metadata

## Files to Create/Modify

### New Files
- `src/core/chorus/providers/registry.ts`
- `src/core/chorus/providers/modelDiscovery.ts`
- `src/core/chorus/ModelProviders/BaseOpenAICompatibleProvider.ts`

### Files to Modify
- `src/core/chorus/Models.ts` - Use registry instead of switch statements
- `src/core/utilities/ProxyUtils.ts` - Use registry
- `src/ui/components/ui/provider-logo.tsx` - Use registry
- `src/ui/components/ApiKeysForm.tsx` - Use registry

### Files to Eventually Remove/Simplify
- Individual provider files that use base class
- Hardcoded model migrations in `migrations.rs`

## Timeline Estimate

- Phase 1: 1-2 days
- Phase 2: 2-3 days
- Phase 3: 2-3 days
- Phase 4: 1-2 days
- Phase 5: 2-3 days

**Total: ~2 weeks of focused work**

## Related Issues

<!-- Link to GitHub issues when created -->

---

*Document created: January 2025*
*Status: Proposed*