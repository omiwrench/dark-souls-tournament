import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Layout } from './components/Layout'
import { Home } from './routes/Home'
import { NewMatch } from './routes/NewMatch'
import { HostConsole } from './routes/host/HostConsole'
import './theme/tokens.css'
import './theme/global.css'

const queryClient = new QueryClient()

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/matches/new', element: <NewMatch /> },
    ],
  },
  // The host console uses the whole screen, without the app bar.
  { path: '/matches/:id/host', element: <HostConsole /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
