import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, Button, Input } from '@/design-system/primitives';
import { ProfileForm } from './_forms/ProfileForm';
import { PasswordForm } from './_forms/PasswordForm';
import { NotificationsForm } from './_forms/NotificationsForm';

const VALID_SECTIONS = [
  'profile', 'password', 'notifications', 'integrations',
  'team', 'api', 'billing', 'payment', 'invoices', 'export', 'danger',
] as const;

type Section = (typeof VALID_SECTIONS)[number];

function isValidSection(s: string): s is Section {
  return (VALID_SECTIONS as readonly string[]).includes(s);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  const label = section.charAt(0).toUpperCase() + section.slice(1);
  return { title: `${label} — Settings · Quantika` };
}

function IntegrationsSection() {
  return (
    <div className="space-y-6" data-testid="settings-integrations">
      <div>
        <h2 className="text-base font-semibold text-ds-text">Integrations</h2>
        <p className="text-sm text-ds-text-muted mt-0.5">Connect external services to Quantika.</p>
      </div>

      <div className="space-y-3">
        {[
          {
            name: 'Gmail',
            icon: '📧',
            description: 'Import freight emails automatically',
            connected: false,
            href: '/api/auth/gmail',
          },
          {
            name: 'WhatsApp',
            icon: '💬',
            description: 'Receive match digest on WhatsApp',
            connected: false,
            href: '#',
          },
          {
            name: 'Pipedrive',
            icon: '📊',
            description: 'Sync deals to your CRM',
            connected: false,
            href: '#',
          },
        ].map((integration) => (
          <Card key={integration.name} padding="md">
            <div className="flex items-center gap-4">
              <span className="text-2xl" aria-hidden="true">{integration.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ds-text">{integration.name}</p>
                <p className="text-xs text-ds-text-muted">{integration.description}</p>
              </div>
              {integration.connected ? (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-ds-sm px-2 py-0.5">
                  Connected
                </span>
              ) : (
                <a
                  href={integration.href}
                  className="inline-flex items-center rounded-ds-sm bg-ds-accent px-3 py-1.5 text-xs font-semibold text-ds-accent-fg hover:bg-ds-accent/90 transition-colors duration-ds-fast focus-visible:ring-2 focus-visible:ring-ds-accent/40 outline-none"
                >
                  Connect
                </a>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProfileSection() {
  return (
    <div className="space-y-6" data-testid="settings-profile">
      <div>
        <h2 className="text-base font-semibold text-ds-text">Profile</h2>
        <p className="text-sm text-ds-text-muted mt-0.5">Manage your personal information.</p>
      </div>
      <ProfileForm />
    </div>
  );
}

function PasswordSection() {
  return (
    <div className="space-y-6" data-testid="settings-password">
      <div>
        <h2 className="text-base font-semibold text-ds-text">Password</h2>
        <p className="text-sm text-ds-text-muted mt-0.5">Update your account password.</p>
      </div>
      <PasswordForm />
    </div>
  );
}

function NotificationsSection() {
  return (
    <div className="space-y-6" data-testid="settings-notifications">
      <div>
        <h2 className="text-base font-semibold text-ds-text">Notifications</h2>
        <p className="text-sm text-ds-text-muted mt-0.5">Control how and when Quantika contacts you.</p>
      </div>
      <NotificationsForm />
    </div>
  );
}

function ApiSection() {
  return (
    <div className="space-y-6" data-testid="settings-api">
      <div>
        <h2 className="text-base font-semibold text-ds-text">API Access</h2>
        <p className="text-sm text-ds-text-muted mt-0.5">Programmatic access to Quantika data.</p>
      </div>
      <Card padding="md">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ds-text-muted" htmlFor="api-key">
              API Key
            </label>
            <div className="flex gap-2">
              <Input
                id="api-key"
                type="password"
                value="qk_live_••••••••••••••••"
                readOnly
                className="font-mono text-xs"
              />
              <Button variant="secondary" size="sm" disabled>Copy</Button>
            </div>
          </div>
          <p className="text-xs text-ds-text-muted">
            API access requires a Pro or Enterprise plan.
          </p>
          <Button variant="secondary" size="sm" disabled>Regenerate key</Button>
        </div>
      </Card>
    </div>
  );
}

function ExportSection() {
  return (
    <div className="space-y-6" data-testid="settings-export">
      <div>
        <h2 className="text-base font-semibold text-ds-text">Export your data</h2>
        <p className="text-sm text-ds-text-muted mt-0.5">Download a copy of your Quantika data.</p>
      </div>
      <Card padding="md">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-ds-text">All data (CSV)</p>
            <p className="text-xs text-ds-text-muted mt-0.5">Vessels, cargoes, matches and economics in CSV format.</p>
          </div>
          <Button variant="secondary" size="sm" disabled>Export CSV</Button>
        </div>
      </Card>
      <Card padding="md">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-ds-text">All data (JSON)</p>
            <p className="text-xs text-ds-text-muted mt-0.5">Full structured export including confidence fields.</p>
          </div>
          <Button variant="secondary" size="sm" disabled>Export JSON</Button>
        </div>
      </Card>
    </div>
  );
}

function DangerSection() {
  return (
    <div className="space-y-6" data-testid="settings-danger">
      <div>
        <h2 className="text-base font-semibold text-ds-danger">Danger Zone</h2>
        <p className="text-sm text-ds-text-muted mt-0.5">Irreversible and destructive actions.</p>
      </div>
      <Card padding="md" className="border-ds-danger/30">
        <div className="space-y-3">
          <p className="text-sm font-medium text-ds-text">Delete account</p>
          <p className="text-sm text-ds-text-muted">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <Button variant="danger" size="sm" disabled>Delete my account</Button>
        </div>
      </Card>
    </div>
  );
}

function ComingSoonSection({ section }: { section: string }) {
  const label = section.charAt(0).toUpperCase() + section.slice(1);
  return (
    <div className="space-y-4" data-testid={`settings-${section}`}>
      <div>
        <h2 className="text-base font-semibold text-ds-text">{label}</h2>
      </div>
      <p className="text-sm text-ds-text-muted">
        This section is coming soon.
      </p>
    </div>
  );
}

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isValidSection(section)) notFound();

  switch (section) {
    case 'integrations':  return <IntegrationsSection />;
    case 'profile':       return <ProfileSection />;
    case 'password':      return <PasswordSection />;
    case 'notifications': return <NotificationsSection />;
    case 'api':           return <ApiSection />;
    case 'export':        return <ExportSection />;
    case 'danger':        return <DangerSection />;
    default:              return <ComingSoonSection section={section} />;
  }
}
