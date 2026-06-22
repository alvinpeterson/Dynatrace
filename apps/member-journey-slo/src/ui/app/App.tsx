import { Page } from '@dynatrace/strato-components-preview/layouts';
import { Flex } from '@dynatrace/strato-components/layouts';
import { Heading, Text } from '@dynatrace/strato-components/typography';
import Colors from '@dynatrace/strato-design-tokens/colors';
import { journeysByGroup, EVALUATION_WINDOW } from './config/journeys';
import { SloCard } from './components/SloCard';

export default function App() {
  const groups = journeysByGroup();

  return (
    <Page>
      <Page.Main>
        <Flex flexDirection="column" gap={24} padding={32}>
          <Flex flexDirection="column" gap={4}>
            <Heading level={1}>HealthEquity Member Journey SLOs</Heading>
            <Text style={{ maxWidth: 720 }}>
              Service-level objectives and error budgets for HealthEquity's
              critical member journeys, evaluated over a rolling{' '}
              {EVALUATION_WINDOW.replace('-', '')} window. Journeys are grouped by
              product domain, then ordered by business criticality.
            </Text>
          </Flex>

          {groups.map(({ group, journeys }) => (
            <Flex key={group} flexDirection="column" gap={12}>
              <Heading
                level={3}
                style={{
                  borderBottom: `1px solid ${Colors.Border.Neutral.Default}`,
                  paddingBottom: 4,
                }}
              >
                {group}
              </Heading>
              <Flex flexWrap="wrap" gap={16}>
                {journeys.map((journey) => (
                  <SloCard key={journey.id} journey={journey} />
                ))}
              </Flex>
            </Flex>
          ))}
        </Flex>
      </Page.Main>
    </Page>
  );
}
