
let produtos = [];

//Buscar o banco
async function buscarProdutos() {

    const { data, error } = await supabaseClient
        .from("Produtos")
        .select("*");

    if (error) {
        console.error("Erro ao buscar produtos:", error);
        return;
    }

    produtos = data;

    carregarProdutos();
}
// Quantos dias antes do vencimento um produto vira "Próximo"
const DIAS_LIMITE_PROXIMO = 7;


// Elementos fixos do HTML
const tabela = document.getElementById("listaProdutos");
const alertasEl = document.getElementById("alertas");
const modalOverlay = document.getElementById("modalOverlay");
const modalTitulo = document.getElementById("modalTitulo");
const formProduto = document.getElementById("formProduto");

let filtroAtual = "Todos";
let indexEditando = null; // null = cadastrando novo | número = editando esse índice


// ---------- LÓGICA DE DATA / STATUS ----------

// Converte "dd/mm/aaaa" em objeto Date
function paraData(validade) {
    if (validade.includes("-")) {
        const [ano, mes, dia] = validade.split("-").map(Number);
        return new Date(ano, mes - 1, dia);
    }
    const [dia, mes, ano] = validade.split("/").map(Number);
    return new Date(ano, mes - 1, dia);
}
//Converte aaaa/mm/dd para dd/mm/aaaa
function formatarData(validade) {
    const [ano, mes, dia] = validade.split("-");
    return `${dia}/${mes}/${ano}`;
}

// Calcula quantos dias faltam (negativo = já venceu)
function diasRestantes(validade) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const dataValidade = paraData(validade);
    dataValidade.setHours(0, 0, 0, 0);

    const diffMs = dataValidade - hoje;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Calcula o status a partir da validade (nunca mais digitado à mão)
function calcularStatus(validade) {
    const dias = diasRestantes(validade);

    if (dias < 0) return "Vencido";
    if (dias <= DIAS_LIMITE_PROXIMO) return "Próximo";
    return "Em dia";
}


// ---------- RENDERIZAÇÃO ----------

function carregarProdutos(lista = produtos) {

    tabela.innerHTML = "";

    // Aplica filtro de status por cima da lista recebida (pesquisa ou completa)
    const listaFiltrada = lista.filter(produto => {
        if (filtroAtual === "Todos") return true;
        return calcularStatus(produto.validade) === filtroAtual;
    });

    listaFiltrada.forEach((produto) => {

        // Precisamos do índice real dentro de `produtos` para editar/excluir certo,
        // mesmo depois de filtrar ou pesquisar.
        const indexReal = produtos.indexOf(produto);
        const status = calcularStatus(produto.validade);

        let linha = `
        <tr>
            <td>${produto.nome}</td>
            <td>${produto.marca}</td>
            <td>${produto.lote}</td>
            <td>${formatarData(produto.validade)}</td>
            <td>${produto.quantidade}</td>
            <td><span class="status status-${status.replace(" ", "-").toLowerCase()}">${status}</span></td>
            <td>
                <button onclick="abrirModalEditar(${indexReal})">Editar</button>
                <button onclick="excluirProduto(${indexReal})">Excluir</button>
            </td>
        </tr>
        `;

        tabela.innerHTML += linha;
    });

    atualizarCards();
    atualizarAlertas();
}


function atualizarCards() {

    let emDia = 0, proximos = 0, vencidos = 0;

    produtos.forEach(produto => {
        const status = calcularStatus(produto.validade);
        if (status === "Em dia") emDia++;
        else if (status === "Próximo") proximos++;
        else vencidos++;
    });

    document.getElementById("totalEmDia").innerText = emDia;
    document.getElementById("totalProximos").innerText = proximos;
    document.getElementById("totalVencidos").innerText = vencidos;
    document.getElementById("totalProdutos").innerText = produtos.length;
}


function atualizarAlertas() {

    const vencidos = produtos.filter(p => calcularStatus(p.validade) === "Vencido");
    const proximos = produtos.filter(p => calcularStatus(p.validade) === "Próximo");

    if (vencidos.length === 0 && proximos.length === 0) {
        alertasEl.innerHTML = "";
        return;
    }

    let html = "";

    if (vencidos.length > 0) {
        const nomes = vencidos.map(p => p.nome).join(", ");
        html += `<div class="alerta alerta-vencido">⚠️ Vencido(s): ${nomes}</div>`;
    }

    if (proximos.length > 0) {
        const nomes = proximos.map(p => p.nome).join(", ");
        html += `<div class="alerta alerta-proximo">⏰ Vencendo em breve: ${nomes}</div>`;
    }

    alertasEl.innerHTML = html;
}


// ---------- CADASTRO / EDIÇÃO (MODAL) ----------

function abrirModalNovo() {
    indexEditando = null;
    modalTitulo.innerText = "Novo Produto";
    formProduto.reset();
    modalOverlay.style.display = "flex";
}

function abrirModalEditar(index) {
    indexEditando = index;
    const produto = produtos[index];

    modalTitulo.innerText = "Editar Produto";
    document.getElementById("inputNome").value = produto.nome;
    document.getElementById("inputMarca").value = produto.marca;
    document.getElementById("inputLote").value = produto.lote;
    document.getElementById("inputValidade").value = formatarData(produto.validade);
    document.getElementById("inputQuantidade").value = produto.quantidade;

    modalOverlay.style.display = "flex";
}

function fecharModal() {
    modalOverlay.style.display = "none";
    formProduto.reset();
    indexEditando = null;
}

async function salvarProduto(event) {
    event.preventDefault();

    const nome = document.getElementById("inputNome").value.trim();
    const marca = document.getElementById("inputMarca").value.trim();
    const lote = document.getElementById("inputLote").value.trim();
    const validade = document.getElementById("inputValidade").value.trim();
    const quantidade = Number(
        document.getElementById("inputQuantidade").value
    );

    // Validação da data
    const formatoValido = /^\d{2}\/\d{2}\/\d{4}$/.test(validade);

    if (!formatoValido) {
        alert("Data inválida. Use o formato dd/mm/aaaa.");
        return;
    }

    const [dia, mes, ano] = validade.split("/");

    const validadeBanco = `${ano}-${mes}-${dia}`;

    const produto = {
            nome,
            marca,
            lote,
            validade: validadeBanco,
            quantidade
        };

    // NOVO PRODUTO
    if (indexEditando === null) {

        const { data, error } = await supabaseClient
            .from("Produtos")
            .insert([produto])
            .select();

        if (error) {
    console.error("Erro ao cadastrar produto:", error);
    console.error("Mensagem:", error.message);
    console.error("Detalhes:", error.details);
    console.error("Hint:", error.hint);
    console.error("Código:", error.code);

    alert("Erro ao cadastrar produto.");
    return;
}

        produtos.push(data[0]);

    } else {

        // EDITAR PRODUTO
        const id = produtos[indexEditando].id;

        const { data, error } = await supabaseClient
            .from("Produtos")
            .update(produto)
            .eq("id", id)
            .select();

        if (error) {
            console.error("Erro ao editar produto:", error);
            alert("Erro ao editar produto.");
            return;
        }

        produtos[indexEditando] = data[0];
    }

    fecharModal();
    carregarProdutos();
}


// Excluir produto
async function excluirProduto(index) {

    const produto = produtos[index];

    const confirmar = confirm(
        `Deseja excluir o produto "${produto.nome}"?`
    );

    if (!confirmar) {
        return;
    }

    const { error } = await supabaseClient
        .from("Produtos")
        .delete()
        .eq("id", produto.id);

    if (error) {
        console.error("Erro ao excluir produto:", error);
        alert("Erro ao excluir produto.");
        return;
    }

    produtos.splice(index, 1);
    carregarProdutos();
}


// ---------- EVENTOS ----------

document.getElementById("btnNovoProduto").addEventListener("click", abrirModalNovo);
document.getElementById("btnCancelar").addEventListener("click", fecharModal);
formProduto.addEventListener("submit", salvarProduto);

// Fecha o modal clicando fora dele
modalOverlay.addEventListener("click", function (event) {
    if (event.target === modalOverlay) fecharModal();
});

// Pesquisa
document.getElementById("pesquisa").addEventListener("input", function () {
    const texto = this.value.toLowerCase();
    const resultado = produtos.filter(produto =>
        produto.nome.toLowerCase().includes(texto)
    );
    carregarProdutos(resultado);
});

// Filtros de status
document.querySelectorAll(".filtros button").forEach(botao => {
    botao.addEventListener("click", function () {
        filtroAtual = this.dataset.filtro;

        document.querySelectorAll(".filtros button")
            .forEach(b => b.classList.remove("filtro-ativo"));
        this.classList.add("filtro-ativo");

        carregarProdutos();
    });
});
//Biblioteca supabase
const SUPABASE_URL = "https://znjvgkbbxbtgnupsxthy.supabase.co";

const SUPABASE_KEY = "sb_publishable_08GEGKb1Xo75XRE6s2_feA_Ob2PAdLT";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

// Inicialização
buscarProdutos();