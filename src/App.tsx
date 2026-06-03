import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import RepositoriesPage from '@/pages/RepositoriesPage';
import IssuesPage from '@/pages/IssuesPage';
import KommentarePage from '@/pages/KommentarePage';
import PublicFormRepositories from '@/pages/public/PublicForm_Repositories';
import PublicFormIssues from '@/pages/public/PublicForm_Issues';
import PublicFormKommentare from '@/pages/public/PublicForm_Kommentare';
// <public:imports>
// </public:imports>
// <custom:imports>
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/6a2018d55773ce092125236a" element={<PublicFormRepositories />} />
              <Route path="public/6a2018da19545f2ab61978ca" element={<PublicFormIssues />} />
              <Route path="public/6a2018db7f79b8b00580989b" element={<PublicFormKommentare />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="repositories" element={<RepositoriesPage />} />
                <Route path="issues" element={<IssuesPage />} />
                <Route path="kommentare" element={<KommentarePage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
