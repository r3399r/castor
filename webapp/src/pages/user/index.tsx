import { useEffect, useState } from 'react';
import userEndpoint from 'src/api/userEndpoint';
import type { GetUserStatsResponse } from 'src/model/backend/api/User';
import { BarChart } from '@mui/x-charts/BarChart';

const User = () => {
  const [stats, setStats] = useState<GetUserStatsResponse>();

  useEffect(() => {
    userEndpoint.getUserStats().then((res) => {
      if (res) setStats(res.data);
    });
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        {stats?.map((stat) => {
          return (
            <div key={stat.id}>
              <div>類別: {stat.category.map((c) => c.name).join(', ')}</div>
              <div>科目: {stat.name}</div>
              <BarChart
                dataset={stat.conceptGroup}
                series={[{ dataKey: 'mastery' }]}
                layout="horizontal"
                xAxis={[{ min: 0, max: 10 }]}
                yAxis={[
                  {
                    dataKey: 'name',
                    width: Math.max(...stat.conceptGroup.map((o) => o.name.length * 16)),
                  },
                ]}
              ></BarChart>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default User;
