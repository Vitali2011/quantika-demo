// Pure TypeScript — NO React imports

export interface PipelineStep {
  label: string;
  endpoint: string;
  critical?: boolean;
}

export interface PipelineStepGroup {
  steps: PipelineStep[];
  parallel?: boolean;
}

export const STEP_GROUPS: PipelineStepGroup[] = [
  { steps: [{ label: 'Loading emails from Gmail...', endpoint: '/api/emails/fetch', critical: true }] },
  { steps: [{ label: 'Sorting your inbox by type...', endpoint: '/api/ai/classify', critical: true }] },
  { steps: [
    { label: 'Reading your cargo inquiries...', endpoint: '/api/ai/parse-cargo' },
    { label: 'Extracting vessel details...', endpoint: '/api/ai/parse-vessel' },
    { label: 'Extracting fixture recaps...', endpoint: '/api/ai/parse-recap' },
  ], parallel: true },
  { steps: [{ label: 'Finding available vessels for your cargo...', endpoint: '/api/ai/match' }] },
  { steps: [
    { label: 'Summarizing your negotiations...', endpoint: '/api/ai/recap' },
    { label: 'Mapping your network...', endpoint: '/api/ai/counterparty' },
  ], parallel: true },
];

export const PIPELINE_STEPS: PipelineStep[] = STEP_GROUPS.flatMap(g => g.steps);
