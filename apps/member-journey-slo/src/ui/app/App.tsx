import { Page } from '@dynatrace/strato-components-preview/layouts';
import { Flex } from '@dynatrace/strato-components/layouts';
import { Heading, Text } from '@dynatrace/strato-components/typography';
import { journeysByTier, EVALUATION_WINDOW } from './config/journeys';
import { SloCard } from './components/SloCard';

export default function App() {
  const journeys = journeysByTier();

  return (
    <Page>
      <Page.Main>
        <Flex flexDirection="column" gap={24} padding={32}>
          <Flex flexDirection="column" gap={4}>
            <Heading level={1}>HealthEquity Member Journey SLOs</Heading>
            <Text style={{ maxWidth: 720 }}>
              Service-level objectives and error budgets for HealthEquity's most
              critical member journeys, evaluated over a rolling{' '}
              {EVALUATION_WINDOW.replace('-', '')} window. Cards are ordered by
              business criticality.
            </Text>
          </Flex>

          <Flex flexWrap="wrap" gap={16}>
            {journeys.map((journey) => (
              <SloCard key={journey.id} journey={journey} />
            ))}
          </Flex>
        </Flex>
      </Page.Main>
    </Page>
  );
}
