"use client";
import { createContext, useContext, useEffect, useState } from "react";

const CarrinhoContext = createContext(null);
const CHAVE_STORAGE = "carrinho_pecas_v1";

export function CarrinhoProvider({ children }) {
  const [clienteId, setClienteId] = useState(null);
  const [clienteNome, setClienteNome] = useState("");
  const [itens, setItens] = useState([]);
  // margem única do orçamento em andamento — vive aqui (não em cada tela)
  // pra quem escolher a margem na Consulta de Peças e for direto pro
  // carrinho ver o MESMO valor aplicado, em vez do carrinho recalcular
  // tudo do zero com um padrão de 30%.
  const [margem, setMargem] = useState(30);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_STORAGE);
      if (salvo) {
        const dados = JSON.parse(salvo);
        setClienteId(dados.clienteId || null);
        setClienteNome(dados.clienteNome || "");
        setItens(dados.itens || []);
        if (typeof dados.margem === "number" && !isNaN(dados.margem)) setMargem(dados.margem);
      }
    } catch (e) {}
    setPronto(true);
  }, []);

  useEffect(() => {
    if (!pronto) return;
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify({ clienteId, clienteNome, itens, margem }));
  }, [clienteId, clienteNome, itens, margem, pronto]);

  function selecionarCliente(id, nome) {
    if (id !== clienteId) {
      setItens([]); // troca de cliente esvazia o carrinho
      setMargem(30); // e volta a margem pro padrão — é um orçamento novo
    }
    setClienteId(id);
    setClienteNome(nome);
  }

  function adicionarItem(peca, qtd = 1) {
    setItens((atual) => {
      const existente = atual.find((i) => i.pecaId === peca.id);
      if (existente) {
        return atual.map((i) => (i.pecaId === peca.id ? { ...i, qtd: i.qtd + qtd } : i));
      }
      return [
        ...atual,
        {
          pecaId: peca.id,
          modelo: peca.modelo,
          categoria: peca.categoria,
          codigo: peca.codigo,
          descricaoResumida: peca.descricao_resumida,
          descricaoPeca: peca.descricao_peca,
          custoUnitario: peca.valor_unitario,
          qtd
        }
      ];
    });
  }

  function mudarQtd(pecaId, qtd) {
    const n = Math.max(1, parseInt(qtd, 10) || 1);
    setItens((atual) => atual.map((i) => (i.pecaId === pecaId ? { ...i, qtd: n } : i)));
  }

  function removerItem(pecaId) {
    setItens((atual) => atual.filter((i) => i.pecaId !== pecaId));
  }

  function limparCarrinho() {
    setItens([]);
    setClienteId(null);
    setClienteNome("");
    setMargem(30);
  }

  const totalItens = itens.reduce((s, i) => s + i.qtd, 0);

  return (
    <CarrinhoContext.Provider
      value={{ clienteId, clienteNome, itens, totalItens, margem, setMargem, selecionarCliente, adicionarItem, mudarQtd, removerItem, limparCarrinho }}
    >
      {children}
    </CarrinhoContext.Provider>
  );
}

export function useCarrinho() {
  return useContext(CarrinhoContext);
}
