import React from 'react';
import { Flex } from '@dynatrace/strato-components/layouts';
import { Heading, Text } from '@dynatrace/strato-components/typography';
import { ProgressCircle } from '@dynatrace/strato-components-preview/content';
import Colors from '@dynatrace/strato-design-tokens/colors';
import type { Journey, JourneySlo } from '../config/journeys';
import { sloQuery } from '../queries/slo';
import { useDql } from '../hooks/useDql';

/** Shape returned by the availability/latency SLI queries (see queries/slo.ts). */
interface SloRecord {
  sli: number;
  target: number;
  total: number;
  failed?: number;
  errorBudgetBurnedPct?: number;
}

function statusColor(meetsTarget: boolean): string {
  return meetsTarget ? Colors.Text.Success.Default : Colors.Text.Critical.Default;
}

function sloLabel(slo: JourneySlo): string {
  return slo.type === 'availability'
    ? `Availability · target ${slo.target}%`
    : `Latency ≤ ${slo.thresholdMs}ms · target ${slo.target}%`;
}

function SloRow({ journey, slo }: { journey: Journey; slo: JourneySlo }) {
  const { data, loading, error } = useDql<SloRecord>(sloQuery(journey, slo));
  const record = data?.[0];

  if (loading) {
    return (
      <Flex alignItems="center" gap={8}>
        <ProgressCircle size="small" />
        <Text>{sloLabel(slo)}</Text>
      </Flex>
    );
  }

  if (error || !record) {
    return (
      <Text textStyle="small" style={{ color: Colors.Text.Critical.Default }}>
        {sloLabel(slo)} — no data{error ? `: ${error.message}` : ''}
      </Text>
    );
  }

  const meetsTarget = record.sli >= record.target;
  const budgetBurned = record.errorBudgetBurnedPct;

  return (
    <Flex flexDirection="column" gap={2}>
      <Flex justifyContent="space-between" alignItems="baseline">
        <Text textStyle="small">{sloLabel(slo)}</Text>
        <Heading level={5} style={{ color: statusColor(meetsTarget) }}>
          {record.sli.toFixed(2)}%
        </Heading>
      </Flex>
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
        {record.total.toLocaleString()} journeys
        {typeof budgetBurned === 'number'
          ? ` · error budget burned ${budgetBurned.toFixed(0)}%`
          : ''}
      </Text>
    </Flex>
  );
}

const TIER_LABEL: Record<Journey['tier'], string> = {
  critical: 'Critical',
  high: 'High',
  standard: 'Standard',
};

/** One card per member journey, listing each of its SLOs. */
export function SloCard({ journey }: { journey: Journey }) {
  return (
    <Flex
      flexDirection="column"
      gap={12}
      padding={16}
      style={{
        border: `1px solid ${Colors.Border.Neutral.Default}`,
        borderRadius: 8,
        background: Colors.Background.Surface.Default,
        minWidth: 280,
      }}
    >
      <Flex flexDirection="column" gap={2}>
        <Flex justifyContent="space-between" alignItems="center">
          <Heading level={4}>{journey.name}</Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
            {TIER_LABEL[journey.tier]}
          </Text>
        </Flex>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
          {journey.description}
        </Text>
      </Flex>
      <Flex flexDirection="column" gap={10}>
        {journey.slos.map((slo) => (
          <SloRow key={`${journey.id}-${slo.type}`} journey={journey} slo={slo} />
        ))}
      </Flex>
    </Flex>
  );
}
