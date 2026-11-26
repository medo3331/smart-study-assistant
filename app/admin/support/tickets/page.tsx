// ===========================================================================
// MAGICLY — SPRINT 1 — Batch 1
// Support Tickets — Admin Dashboard (placeholder for future implementation)
// ===========================================================================
// This is a placeholder component. The full admin support workspace is
// designed as part of Batch 4 (Unified Inbox). For now, this provides a
// minimal interface demonstrating the data structure.
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  rating: number | null;
  created_at: string;
  user_id: string;
}

export default function AdminTicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchTickets();
  }, [search]);

  async function fetchTickets() {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // In a real implementation, this would use the admin service client.
      // For now, simulate an API call.
      const res = await fetch(`/api/tickets?search=${encodeURIComponent(search)}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setTickets(data.tickets);
      }
    } catch (error) {
      console.error('[admin] Failed to fetch tickets', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading tickets...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1>Support Tickets</h1>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          <Link
            href="/dashboard/support-tickets/new"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            + New Ticket
          </Link>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td className="px-4 py-3 text-sm text-gray-900">{ticket.id}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{ticket.subject}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{ticket.category}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${
                    ticket.status === 'open' ? 'bg-green-100 text-green-800' :
                    ticket.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    ticket.status === 'resolved' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {ticket.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{ticket.priority}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{ticket.rating ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(ticket.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
