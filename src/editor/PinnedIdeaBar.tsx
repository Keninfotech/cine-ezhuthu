import { useState } from 'react';
import type { IdeaData } from '../lib/types';

export function PinnedIdeaBar({
  idea,
  onOpenIdeaStage,
}: {
  idea: IdeaData | undefined;
  onOpenIdeaStage: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!idea || !idea.pinned || (!idea.seed && !idea.logline.protagonist)) {
    return null;
  }

  const loglineText = idea.logline.protagonist
    ? `When ${idea.logline.incitingIncident || 'disruption occurs'}, ${idea.logline.protagonist} must ${idea.logline.goal || 'reach their goal'}, facing ${idea.logline.conflict || 'odds'}.`
    : '';

  return (
    <div className="pinned-idea-bar" role="region" aria-label="Pinned story idea">
      <div className="pinned-idea-summary" onClick={() => setExpanded((e) => !e)}>
        <span className="pinned-tag">🌱 Stage 1 Idea</span>
        {idea.genre && <span className="pinned-genre">{idea.genre}</span>}
        <span className="pinned-text">{idea.seed || loglineText || 'Click to view core idea'}</span>
        <button
          type="button"
          className="link small pinned-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => !x);
          }}
          aria-expanded={expanded}
        >
          {expanded ? '▲ Collapse' : '▼ Details'}
        </button>
        <button
          type="button"
          className="link small pinned-edit-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenIdeaStage();
          }}
          title="Edit Idea in Stage 1"
        >
          ✏ Edit Seed
        </button>
      </div>

      {expanded && (
        <div className="pinned-idea-details">
          {idea.seed && (
            <div className="detail-item">
              <b>Seed:</b> <span>{idea.seed}</span>
            </div>
          )}
          {loglineText && (
            <div className="detail-item">
              <b>Logline:</b> <span>{loglineText}</span>
            </div>
          )}
          <div className="detail-grid">
            {idea.logline.protagonist && (
              <div>
                <span className="muted small">Protagonist:</span> <div>{idea.logline.protagonist}</div>
              </div>
            )}
            {idea.logline.incitingIncident && (
              <div>
                <span className="muted small">Inciting Incident:</span> <div>{idea.logline.incitingIncident}</div>
              </div>
            )}
            {idea.logline.goal && (
              <div>
                <span className="muted small">Goal:</span> <div>{idea.logline.goal}</div>
              </div>
            )}
            {idea.logline.conflict && (
              <div>
                <span className="muted small">Conflict:</span> <div>{idea.logline.conflict}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

