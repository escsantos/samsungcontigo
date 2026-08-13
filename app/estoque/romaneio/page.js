"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RomaneioPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24, fontFamily: "sans-serif" }}>Carregando...</p>}>
      <RomaneioConteudo />
    </Suspense>
  );
}

function RomaneioConteudo() {
  const params = useSearchParams();
  const [pedidos, setPedidos] = useState([]);
  const [cliente, setCliente] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      const idsParam = params.get("ids");
      if (!idsParam) { setCarregando(false); return; }
      const ids = idsParam.split(",").map((x) => parseInt(x, 10)).filter(Boolean);

      const { data: orcs } = await supabase
        .from("orcamentos")
        .select("*, clientes(nome, cpf, cnpj, celular, logradouro, numero, bairro, cidade, estado)")
        .in("id", ids)
        .order("id");

      const listaComItens = [];
      for (const o of orcs || []) {
        const { data: its } = await supabase.from("orcamento_itens").select("*").eq("orcamento_id", o.id).order("id");
        const { data: pags } = await supabase.from("pagamentos_orcamento").select("*").eq("orcamento_id", o.id).order("registrado_em");
        listaComItens.push({ ...o, itens: its || [], pagamentos: pags || [] });
      }

      setPedidos(listaComItens);
      setCliente(listaComItens[0]?.clientes || null);
      setCarregando(false);
    })();
  }, [params]);

  useEffect(() => {
    if (!carregando && pedidos.length > 0) {
      setTimeout(() => window.print(), 400);
    }
  }, [carregando, pedidos]);

  if (carregando) return <p style={{ padding: 24, fontFamily: "sans-serif" }}>Carregando romaneio...</p>;
  if (pedidos.length === 0) return <p style={{ padding: 24, fontFamily: "sans-serif" }}>Nenhum pedido encontrado.</p>;

  const totalGeral = pedidos.reduce((s, p) => s + Number(p.valor_total || 0), 0);
  const endereco = cliente ? [cliente.logradouro, cliente.numero, cliente.bairro, cliente.cidade, cliente.estado].filter(Boolean).join(", ") : "";

  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#14181F", padding: "32px 40px", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #14181F", paddingBottom: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Romaneio de Entrega</h1>
          <p style={{ fontSize: 12, color: "#6B7482", margin: "4px 0 0" }}>Grupo J.Macedo — Gerado em {new Date().toLocaleString("pt-BR")}</p>
        </div>
        <img src="/logos/grupo-jmacedo.png" alt="Grupo J.Macedo" style={{ height: 40 }} />
      </div>

      <div style={{ marginBottom: 20, fontSize: 13 }}>
        <p style={{ margin: "2px 0" }}><b>Cliente:</b> {cliente?.nome}</p>
        {cliente?.cpf && <p style={{ margin: "2px 0" }}><b>CPF:</b> {cliente.cpf}</p>}
        {cliente?.cnpj && <p style={{ margin: "2px 0" }}><b>CNPJ:</b> {cliente.cnpj}</p>}
        {cliente?.celular && <p style={{ margin: "2px 0" }}><b>Telefone:</b> {cliente.celular}</p>}
        {endereco && <p style={{ margin: "2px 0" }}><b>Endereço:</b> {endereco}</p>}
      </div>

      {pedidos.map((p) => (
        <div key={p.id} style={{ marginBottom: 20, breakInside: "avoid" }}>
          <p style={{ fontSize: 13, fontWeight: 700, background: "#F4F6F9", padding: "6px 10px", borderRadius: 4 }}>
            Pedido #{p.id} — {new Date(p.criado_em).toLocaleDateString("pt-BR")}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 6 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd", textAlign: "left" }}>
                <th style={{ padding: "4px 6px" }}>Código</th>
                <th style={{ padding: "4px 6px" }}>Descrição</th>
                <th style={{ padding: "4px 6px", textAlign: "center" }}>Qtd</th>
                <th style={{ padding: "4px 6px", textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {p.itens.map((i) => (
                <tr key={i.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "4px 6px", fontFamily: "monospace" }}>{i.codigo}</td>
                  <td style={{ padding: "4px 6px" }}>{i.descricao_resumida}</td>
                  <td style={{ padding: "4px 6px", textAlign: "center" }}>{i.qtd}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtBRL(i.venda_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ textAlign: "right", fontSize: 12, fontWeight: 700, marginTop: 4 }}>Subtotal: {fmtBRL(p.valor_total)}</p>
          {p.pagamentos.length > 0 && (
            <div style={{ marginTop: 6, background: "#F9FAFB", borderRadius: 4, padding: "6px 10px" }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: "#6B7482", margin: "0 0 3px" }}>Pagamento</p>
              {p.pagamentos.map((pag) => (
                <p key={pag.id} style={{ fontSize: 11, margin: "1px 0" }}>
                  {pag.forma_pagamento} — {fmtBRL(pag.valor)} em {new Date(pag.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}

      <div style={{ borderTop: "2px solid #14181F", paddingTop: 12, marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 11, color: "#6B7482" }}>{pedidos.length} pedido(s) neste romaneio</p>
        <p style={{ fontSize: 15, fontWeight: 700 }}>Total geral: {fmtBRL(totalGeral)}</p>
      </div>

      <div style={{ marginTop: 60, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <div style={{ textAlign: "center", width: "45%" }}>
          <div style={{ borderTop: "1px solid #14181F", paddingTop: 6 }}>Assinatura de quem entrega</div>
        </div>
        <div style={{ textAlign: "center", width: "45%" }}>
          <div style={{ borderTop: "1px solid #14181F", paddingTop: 6 }}>Assinatura de quem recebe</div>
        </div>
      </div>
    </div>
  );
}
