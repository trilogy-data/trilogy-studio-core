import { describe, it, expect } from 'vitest'
import { buildCommunityModelTree, generateRootKey } from './displayHelpers'
import type { ModelRoot, ModelFile, GithubModelStore, GenericModelStore } from './models'

describe('buildCommunityModelTree', () => {
  it('should build a tree with a single GitHub store', () => {
    const store: GithubModelStore = {
      type: 'github',
      id: 'test-org-test-repo-main',
      name: 'Test Store',
      owner: 'test-org',
      repo: 'test-repo',
      branch: 'main',
    }

    const files: ModelFile[] = [
      {
        name: 'Model A',
        description: 'Test model A',
        engine: 'duckdb',
        downloadUrl: 'http://example.com/model-a.json',
        components: [],
      },
      {
        name: 'Model B',
        description: 'Test model B',
        engine: 'bigquery',
        downloadUrl: 'http://example.com/model-b.json',
        components: [],
      },
    ]

    const tree = buildCommunityModelTree({}, [store], { [store.id]: files })

    // Should have root node
    expect(tree[0].type).toBe('root')
    expect(tree[0].label).toBe('Test Store')
    expect(tree[0].key).toBe('test-org-test-repo-main')

    // Should have engines (sorted alphabetically) with models nested under them
    expect(tree[1].type).toBe('engine')
    expect(tree[1].label).toBe('bigquery')
    expect(tree[2].type).toBe('model')
    expect(tree[2].label).toBe('Model B')

    expect(tree[3].type).toBe('engine')
    expect(tree[3].label).toBe('duckdb')
    expect(tree[4].type).toBe('model')
    expect(tree[4].label).toBe('Model A')
  })

  it('should build a tree with a generic store', () => {
    const store: GenericModelStore = {
      type: 'generic',
      id: 'localhost-8000',
      name: 'Local Dev Store',
      baseUrl: 'http://localhost:8000',
    }

    const files: ModelFile[] = [
      {
        name: 'Local Model',
        description: 'Test local model',
        engine: 'duckdb',
        downloadUrl: 'http://localhost:8000/models/local.json',
        components: [],
      },
    ]

    const tree = buildCommunityModelTree({}, [store], { [store.id]: files })

    expect(tree[0].type).toBe('root')
    expect(tree[0].label).toBe('Local Dev Store')
    expect(tree[0].store).toEqual(store)
    expect(tree[1].type).toBe('engine')
    expect(tree[1].label).toBe('duckdb')
    expect(tree[2].type).toBe('model')
    expect(tree[2].label).toBe('Local Model')
  })

  it('should build a tree with multiple stores', () => {
    const githubStore: GithubModelStore = {
      type: 'github',
      id: 'trilogy-data-trilogy-public-models-main',
      name: 'Trilogy Public Models',
      owner: 'trilogy-data',
      repo: 'trilogy-public-models',
      branch: 'main',
    }

    const genericStore: GenericModelStore = {
      type: 'generic',
      id: 'localhost-8000',
      name: 'Local Dev Store',
      baseUrl: 'http://localhost:8000',
    }

    const githubFiles: ModelFile[] = [
      {
        name: 'Public Model',
        description: 'Public model',
        engine: 'duckdb',
        downloadUrl: 'http://example.com/public.json',
        components: [],
      },
    ]

    const genericFiles: ModelFile[] = [
      {
        name: 'Local Model',
        description: 'Local model',
        engine: 'bigquery',
        downloadUrl: 'http://localhost:8000/local.json',
        components: [],
      },
    ]

    const tree = buildCommunityModelTree({}, [githubStore, genericStore], {
      [githubStore.id]: githubFiles,
      [genericStore.id]: genericFiles,
    })

    // Should have nodes from both stores
    expect(tree.length).toBe(6) // 2 roots + 2 engines + 2 models

    // First store
    expect(tree[0].label).toBe('Trilogy Public Models')
    expect(tree[1].label).toBe('duckdb')
    expect(tree[2].label).toBe('Public Model')

    // Second store
    expect(tree[3].label).toBe('Local Dev Store')
    expect(tree[4].label).toBe('bigquery')
    expect(tree[5].label).toBe('Local Model')
  })

  it('should respect collapsed state for stores', () => {
    const store: GithubModelStore = {
      type: 'github',
      id: 'test-org-test-repo-main',
      name: 'Test Store',
      owner: 'test-org',
      repo: 'test-repo',
      branch: 'main',
    }

    const files: ModelFile[] = [
      {
        name: 'Model A',
        description: 'Test model A',
        engine: 'duckdb',
        downloadUrl: 'http://example.com/model-a.json',
        components: [],
      },
    ]

    const tree = buildCommunityModelTree(
      { [store.id]: true }, // Collapsed
      [store],
      { [store.id]: files },
    )

    // Should only have root node when collapsed
    expect(tree.length).toBe(1)
    expect(tree[0].type).toBe('root')
  })

  it('should respect collapsed state for engines', () => {
    const store: GithubModelStore = {
      type: 'github',
      id: 'test-org-test-repo-main',
      name: 'Test Store',
      owner: 'test-org',
      repo: 'test-repo',
      branch: 'main',
    }

    const files: ModelFile[] = [
      {
        name: 'Model A',
        description: 'Test model A',
        engine: 'duckdb',
        downloadUrl: 'http://example.com/model-a.json',
        components: [],
      },
    ]

    const engineKey = `${store.id}+duckdb`

    const tree = buildCommunityModelTree(
      { [engineKey]: true }, // Engine collapsed
      [store],
      { [store.id]: files },
    )

    // Should have root and engine, but not models
    expect(tree.length).toBe(2)
    expect(tree[0].type).toBe('root')
    expect(tree[1].type).toBe('engine')
  })

  it('should group models by engine correctly', () => {
    const store: GithubModelStore = {
      type: 'github',
      id: 'test-org-test-repo-main',
      name: 'Test Store',
      owner: 'test-org',
      repo: 'test-repo',
      branch: 'main',
    }

    const files: ModelFile[] = [
      {
        name: 'DuckDB Model 1',
        description: 'Test',
        engine: 'duckdb',
        downloadUrl: 'http://example.com/d1.json',
        components: [],
      },
      {
        name: 'BigQuery Model',
        description: 'Test',
        engine: 'bigquery',
        downloadUrl: 'http://example.com/bq.json',
        components: [],
      },
      {
        name: 'DuckDB Model 2',
        description: 'Test',
        engine: 'duckdb',
        downloadUrl: 'http://example.com/d2.json',
        components: [],
      },
    ]

    const tree = buildCommunityModelTree({}, [store], { [store.id]: files })

    // Root
    expect(tree[0].type).toBe('root')

    // Engines (alphabetically sorted) with models nested under them
    expect(tree[1].type).toBe('engine')
    expect(tree[1].label).toBe('bigquery')
    expect(tree[2].type).toBe('model')
    expect(tree[2].label).toBe('BigQuery Model')

    expect(tree[3].type).toBe('engine')
    expect(tree[3].label).toBe('duckdb')
    expect(tree[4].type).toBe('model')
    expect(tree[4].label).toBe('DuckDB Model 1')
    expect(tree[5].type).toBe('model')
    expect(tree[5].label).toBe('DuckDB Model 2')
  })

  it('should handle empty stores', () => {
    const store: GenericModelStore = {
      type: 'generic',
      id: 'empty-store',
      name: 'Empty Store',
      baseUrl: 'http://example.com',
    }

    const tree = buildCommunityModelTree({}, [store], { [store.id]: [] })

    // Should only have root node
    expect(tree.length).toBe(1)
    expect(tree[0].type).toBe('root')
    expect(tree[0].label).toBe('Empty Store')
  })
})

describe('generateRootKey', () => {
  it('should generate correct key for modelRoot', () => {
    const modelRoot: ModelRoot = {
      owner: 'trilogy-data',
      repo: 'trilogy-public-models',
      branch: 'main',
    }

    expect(generateRootKey(modelRoot)).toBe('trilogy-data-trilogy-public-models-main')
  })

  it('should handle different branches', () => {
    const modelRoot: ModelRoot = {
      owner: 'test-org',
      repo: 'test-repo',
      branch: 'develop',
    }

    expect(generateRootKey(modelRoot)).toBe('test-org-test-repo-develop')
  })
})
