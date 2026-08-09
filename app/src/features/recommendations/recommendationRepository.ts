import type { LocalRepository } from '../sync/localRepository'
import {
  listActiveLocalEntities,
  type RepositoryContext,
} from '../sync/repositoryContext'

export function createRecommendationRepository(
  localRepository: LocalRepository,
  context: RepositoryContext,
) {
  async function listRecommendations() {
    return listActiveLocalEntities(
      localRepository,
      'aiRecommendations',
      context.userId,
    )
  }

  return {
    listRecommendations,
    async getRecommendation(entityId: string) {
      return (await listRecommendations()).find((row) => row.id === entityId) ?? null
    },
  }
}
