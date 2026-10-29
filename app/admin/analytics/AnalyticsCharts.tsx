"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#fbbf24"];

export default function AnalyticsCharts({
  daily,
  plans,
}: {
  daily: { day: string; count: number }[];
  plans: { name: string; value: number }[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="border rounded p-4 h-72">
        <h3 className="font-bold mb-2">طلبات AI (آخر 7 أيام)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daily}>
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#60a5fa" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="border rounded p-4 h-72">
        <h3 className="font-bold mb-2">توزيع الاشتراكات النشطة</h3>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={plans} dataKey="value" nameKey="name" outerRadius={90} label>
              {plans.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
