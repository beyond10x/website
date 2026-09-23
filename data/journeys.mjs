export const journeysSchema = 'b10x-website-journeys/v1';

export const journeys = Object.freeze([
  Object.freeze({
    id: 'start',
    experienceId: 'try-spec-driven-development',
    label: 'Start',
    hubRoute: '/start/',
    experienceRoute: '/start/spec-driven-development/',
    footerLabel: 'Try a governed change',
  }),
  Object.freeze({
    id: 'learn',
    experienceId: 'understand-safe-agentic-coding',
    label: 'Learn',
    hubRoute: '/learn/',
    experienceRoute: '/learn/safe-agentic-coding/',
    footerLabel: 'Learn safe agentic coding',
    hubActionLabel: 'Learn the safe loop',
  }),
  Object.freeze({
    id: 'build',
    experienceId: 'build-agent-systems',
    label: 'Build',
    hubRoute: '/build/',
    experienceRoute: '/build/agent-systems/',
    footerLabel: 'Build agent systems',
    hubActionLabel: 'Open the builder path',
    gateway: Object.freeze({
      accent: 'mint',
      title: 'Build observable agent systems',
      description: 'Move from host guidance to Harness, Substrate, and outside-in evaluation only when the work needs them.',
    }),
  }),
  Object.freeze({
    id: 'products',
    experienceId: 'evaluate-beyond10x-products',
    label: 'Evaluate',
    hubRoute: '/products/',
    experienceRoute: '/products/evaluate/',
    footerLabel: 'Evaluate products',
    hubActionLabel: 'Open the evaluator path',
    gateway: Object.freeze({
      accent: 'violet',
      title: 'Evaluate a beyond10x product',
      description: 'See what is public, what is preview, and what remains access-gated before planning adoption.',
    }),
  }),
  Object.freeze({
    id: 'operate',
    experienceId: 'deploy-operate-products',
    label: 'Operate',
    hubRoute: '/operate/',
    experienceRoute: '/operate/',
    footerLabel: 'Operate services',
    gateway: Object.freeze({
      accent: 'amber',
      title: 'Deploy an available service',
      description: 'Go directly to service and platform operations without putting cluster detail in the beginner path.',
    }),
  }),
  Object.freeze({
    id: 'contribute',
    experienceId: 'contribute-maintain',
    label: 'Contribute',
    hubRoute: '/contribute/',
    experienceRoute: '/contribute/',
    footerLabel: 'Maintain the documentation system',
    gateway: Object.freeze({
      accent: 'coral',
      title: 'Maintain the documentation system',
      description: 'Change technical truth in its owning repository and preview it through the canonical Website shell.',
    }),
  }),
]);

export function journeyById(id) {
  const journey = journeys.find((candidate) => candidate.id === id);
  if (!journey) throw new Error(`unknown journey id: ${id}`);
  return journey;
}

export function gatewayJourneys() {
  return journeys.filter((journey) => journey.gateway);
}
