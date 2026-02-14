import { Line } from '@ant-design/plots';

// ... imports

// Helper to prepare chart data
const prepareChartData = (runs: ExperimentRunDto[]) => {
  // Sort by time ascending
  const sorted = [...runs].sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

  return sorted.map(run => ({
    time: new Date(run.createdAt!).toLocaleTimeString(),
    duration: run.durationMs,
    variant: `Variant ${run.variant}`,
    status: run.success ? 'Success' : 'Failure'
  }));
};

export const ExperimentEvaluationPage: React.FC = () => {
  // ... existing code ...

  const chartData = useMemo(() => {
    return runsData?.data ? prepareChartData(runsData.data) : [];
  }, [runsData]);

  const chartConfig = {
    data: chartData,
    xField: 'time',
    yField: 'duration',
    seriesField: 'variant',
    color: (datum: any) => datum.variant === 'Variant A' ? variantColors.A : variantColors.B,
    point: {
      shapeField: 'circle',
      sizeField: 4,
    },
    interaction: {
      tooltip: {
        marker: false,
      },
    },
    style: {
      lineWidth: 2,
    },
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      {/* ... Header ... */}

      {/* ... Experiments Table ... */}

      {/* ... Modal ... */}

      {/* ── Evaluation Drawer ── */}
      <Drawer
        title="实验评估看板"
        open={Boolean(selectedExperimentId)}
        onClose={() => setSelectedExperimentId(undefined)}
        width={960}
      >
        {evaluation && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {/* ... Basic Info ... */}

            {/* ... Metrics ... */}

            {/* ── 趋势分析 (New) ── */}
            {runsData?.data && runsData.data.length > 0 && (
              <Card title="耗时趋势分析" size="small">
                <div style={{ height: 300 }}>
                  <Line {...chartConfig} />
                </div>
              </Card>
            )}

            {/* ... Comparison ... */}

            {/* ... Runs Table ... */}
          </Space>
        )}
      </Drawer>
    </Space>
  );
};
