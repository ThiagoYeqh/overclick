"use client";

import type { Dispatch, SetStateAction } from "react";
import { CliLogo } from "./cli-logos";
import { EXECUTOR_CATALOG, type ExecutorSelection } from "../lib/executors";

export type { ExecutorSelection };

/**
 * Grid de executores (mockup onboarding-v5 / settings): 10 CLIs com logos,
 * chips de modelos expansíveis ao marcar, e o card "+ Personalizar"
 * tracejado (MCP genérico). Controlado pelo pai via value/onChange.
 *
 * onChange é um setState do React: as alterações são sempre funcionais, senão
 * dois cliques no mesmo tick (marcar a CLI e um modelo, por exemplo) leem o
 * mesmo `value` e o segundo apaga o primeiro.
 */
export function ExecutorsGrid({
  value,
  onChange,
}: {
  value: ExecutorSelection;
  onChange: Dispatch<SetStateAction<ExecutorSelection>>;
}) {
  const toggleExec = (id: string, models: readonly string[]) => {
    onChange((prev) => {
      const enabled = { ...prev.enabled };
      if (enabled[id]) {
        delete enabled[id];
      } else {
        enabled[id] = [models[0] ?? "auto"];
      }
      return { ...prev, enabled };
    });
  };
  const toggleModel = (id: string, model: string) => {
    onChange((prev) => {
      const current = prev.enabled[id] ?? [];
      const next = current.includes(model)
        ? current.filter((m) => m !== model)
        : [...current, model];
      return { ...prev, enabled: { ...prev.enabled, [id]: next } };
    });
  };

  return (
    <div className="exec-grid">
      {EXECUTOR_CATALOG.map((def) => {
        const on = def.id in value.enabled;
        const selected = value.enabled[def.id] ?? [];
        return (
          <div
            key={def.id}
            className={`exec${on ? " on" : ""}`}
            onClick={() => toggleExec(def.id, def.models)}
          >
            <div className="row">
              <div className="logo">
                <CliLogo id={def.id} />
              </div>
              <div className="name">{def.label}</div>
              <div className="check">✓</div>
            </div>
            <div className="models">
              {def.models.map((m) => (
                <span
                  key={m}
                  className={`mchip${selected.includes(m) ? " on" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleModel(def.id, m);
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        );
      })}
      <div
        className={`exec exec-add${value.customEnabled ? " on" : ""}`}
        onClick={() =>
          onChange((prev) => ({ ...prev, customEnabled: !prev.customEnabled }))
        }
      >
        <div className="row">
          <div className="logo">+</div>
          <div className="name">Personalizar</div>
          <div className="check">✓</div>
        </div>
        <div className="models">
          <input
            className="input mono"
            placeholder="nome da CLI / agente"
            value={value.customName}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const customName = e.target.value;
              onChange((prev) => ({ ...prev, customName }));
            }}
          />
          <span className="note">
            conecta via MCP genérico — pode não reportar custo e tempo (“telemetria
            incompleta”)
          </span>
        </div>
      </div>
    </div>
  );
}
