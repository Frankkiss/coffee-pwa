import { createRoot } from 'react-dom/client'
import { BackupPanel } from './features/backup/BackupPanel'
import { createBackupBrowserFixture } from './features/backup/backupBrowserFixture'
import './index.css'

if (!import.meta.env.DEV) throw new Error('Backup smoke fixture is development-only')

const harness = await createBackupBrowserFixture()
Object.assign(window, { backupFlowSmoke: { downloads: harness.downloads, backup: harness.backup } })
createRoot(document.getElementById('root')!).render(
  <BackupPanel session={harness.session} supabase={harness.supabase} fixture={harness.fixture} />,
)
