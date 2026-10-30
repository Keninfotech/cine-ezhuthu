import { useEffect, useState } from 'react';
import type { Script, Settings } from './lib/types';
import { getScript, loadSettings, saveScript, saveSettings } from './lib/db';
import { Library, Welcome } from './Library';
import { Editor } from './editor/Editor';
import { SettingsDialog } from './editor/Dialogs';
import { sampleScript } from './lib/sample';

const route = () => {
  const m = location.hash.match(/^#\/script\/(\w+)/);
  return m ? m[1] : null;
};

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scriptId, setScriptId] = useState<string | null>(route());
  const [script, setScript] = useState<Script | null>(null);
  const [missing, setMissing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
    const onHash = () => setScriptId(route());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    setScript(null);
    setMissing(false);
    if (scriptId) getScript(scriptId).then((s) => (s ? setScript(s) : setMissing(true)));
  }, [scriptId]);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const open = (id: string) => {
    location.hash = '#/script/' + id;
  };

  if (!settings) return null;

  const welcome = !settings.seenWelcome && (
    <Welcome
      onDone={() => updateSettings({ ...settings, seenWelcome: true })}
      onSample={async () => {
        updateSettings({ ...settings, seenWelcome: true });
        const s = sampleScript();
        await saveScript(s);
        open(s.id);
      }}
    />
  );

  if (scriptId) {
    if (missing)
      return (
        <div className="library">
          <p>That script isn't on this device.</p>
          <button onClick={() => (location.hash = '')}>Back to library</button>
        </div>
      );
    if (!script) return null;
    return (
      <>
        <Editor key={script.id} initial={script} settings={settings} onSettings={updateSettings} onBack={() => (location.hash = '')} />
        {welcome}
      </>
    );
  }

  return (
    <>
      <Library onOpen={open} onSettings={() => setShowSettings(true)} />
      {showSettings && (
        <SettingsDialog
          settings={settings}
          onChange={updateSettings}
          onClose={() => setShowSettings(false)}
          onReplayWelcome={() => { setShowSettings(false); updateSettings({ ...settings, seenWelcome: false }); }}
        />
      )}
      {welcome}
    </>
  );
}
