import type { MouseEvent } from 'react';
import { getBridge } from '@/components/bridge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { runRendererTask } from '@/lib/global-error-recovery';
import { homeContributors } from './home-contributors-data';

function openProfile(event: MouseEvent<HTMLAnchorElement>) {
  const bridge = getBridge();
  if (!bridge) return;
  event.preventDefault();
  const href = event.currentTarget.href;
  runRendererTask('Open owner profile', () => bridge.files.openExternal(href));
}

export function HomeContributors() {
  return (
    <ul className="home-contributors">
      {homeContributors.map(({ login, avatar }) => (
        <li key={login}>
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  className="home-contributor"
                  href={`https://github.com/${login}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`GitHub · @${login}`}
                  onClick={openProfile}
                />
              }
            >
              <span className="home-contributor-avatar">
                <img src={avatar} alt="" width={44} height={44} />
              </span>
            </TooltipTrigger>
            <TooltipContent surface="theme" side="bottom">@{login}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
