pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');

let shadowRoot = null;
let uiContainer = null;


const baseDeRiscos = [
                {
                nome: "CPF",
                regex: /\bcpf\b[\s\S]{0,150}?\b(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/i
                },
                {
                nome: "Dados Financeiros",
                regex: /\bbanco\b[\s\S]{0,40}?\b(conta|agência|agencia|ag\.|n[uú]mero|codigo|código)\b|\b(agência|agencia|ag\.|cc\.|conta corrente|pix|chave pix)\b/i
                },
                {
                nome: "Documentos Pessoais",
                regex: /\b(rg|registro geral|carteira de identidade)\b[\s:=n°º.\-]*\d{1,2}\.?\d{3}\.?\d{3}[-.]?[\dxX]?\b|\bcnh(?:[\s-]*e)?\b[\s:=n°º.\-]*\d{9,11}\b|\bcarteira\s+nacional\s+de\s+habilita[cç][aã]o\b|\bpassaporte\b[\s:=n°º.\-]*[a-z]{1,2}\d{6,7}\b/i
                },
                {
                nome: "Telefone/Celular",
                regex: /\b(telefone|celular|whatsapp)\b[\s\S]{0,150}?\(?\d{2}\)?[\s.\-]?9?\d{4}[\s.\-]?\d{4}\b/i
                },
                {
                nome: "Endereço",
                regex: /\bendere[cç]o\b[\s:=]*((rua|av\.?|avenida|travessa|alameda|rodovia)\s[^\n,]{3,60}|.{0,20}?\d{5}-?\d{3})/i
                },
                {
                nome: "Matrícula/RGA",
                regex: /\b(matr[ií]cula|rga)\b[\s:=\-\t]*(\d{12}|\d{8})\b/i
                },
                {
                nome: "Dados Pessoais Gerais",
                regex: /\bdata de nascimento\b[\s:=]*\d{2}[\/\-]\d{2}[\/\-]\d{2,4}\b|\bsexo\b[\s:=]*(masculino|feminino|m|f)\b|\b(filia[cç][aã]o|nome (da|de) m[aã]e|nome do pai)\b[\s:=]*[^\n,]{2,80}|\bnaturalidade\b[\s:=]*[^\n,]{2,60}|\bestado civil\b[\s:=]*(solteiro|solteira|casado|casada|divorciado|divorciada|separado|separada|vi[uú]vo|vi[uú]va|uni[aã]o est[aá]vel)\b/i
                },
                {
                nome: "Origem Racial/Étnica",
                regex: /\b(ra[cç]a|cor da pele|etnia|indígena|ind[ií]gena|quilombola|afrodescendente|pardo|preto|amarelo)\b/i
                },
                {
                nome: "Convicção Religiosa",
                regex: /\b(religi[aã]o|cren[cç]a religiosa|culto religioso|evang[ée]lico|cat[oó]lico|espírita|umbanda|candombl[ée]|ate[uí]smo|agn[oó]stico)\b/i
                },
                {
                nome: "Opinião Política",
                regex: /\b(opini[aã]o pol[ií]tica|filia[cç][aã]o partid[aá]ria|partido pol[ií]tico|orienta[cç][aã]o pol[ií]tica)\b/i
                },
                {
                nome: "Filiação Sindical/Organizacional",
                regex: /\b(filia[cç][aã]o sindical|sindicato\b[\s\S]{0,40}?(membro|associado|filiado)|organiza[cç][aã]o (religiosa|filos[oó]fica|pol[ií]tica))\b/i
                },
                {
                nome: "Dados de Saúde",
                regex: /\batestado (m[eé]dico|de sa[uú]de)\b[\s\S]{0,600}?\b(cid[\s:\-]?[a-z]?\d{1,3}(\.\d)?|crm[\s:\-]?\d{4,6}\s?[a-z]{0,2}\b)\b/i
                },
                {
                nome: "Vida Sexual/Orientação Sexual",
                regex: /\b(orienta[cç][aã]o sexual|homossexual|heterossexual|bissexual|vida sexual|identidade de g[eê]nero|transg[eê]nero|transexual)\b/i
                },
                {
                nome: "SIAPE",
                regex: /\bsiape\b[\s:=\-]*n?[°ºo]?\.?[\s:=\-]*\d{7}\b/i
                }
            ];



const registrarUsoMetrica = () => {
    try {
        const totalAtual = parseInt(localStorage.getItem('checkpriv_analise') || '0', 10);
        const novoTotal = totalAtual + 1;

        localStorage.setItem('checkpriv_analise', novoTotal.toString());

    } catch (e) {
        console.warn("[CheckPriv Metrics] Não foi possível salvar métrica no localStorage:", e);
    }
};

const registrarFeedback = (resposta, statusAnalise) => {
    try {
        const historico = JSON.parse(localStorage.getItem('checkpriv_feedbacks') || '[]');
        historico.push({
            dataHora: new Date().toISOString(),
            resposta: resposta,
            statusAnalise: statusAnalise
        });
        localStorage.setItem('checkpriv_feedbacks', JSON.stringify(historico));
    } catch (e) {
        console.warn("[CheckPriv Metrics] Erro ao salvar feedback:", e);
    }
};


const criarInterface = () => {
    if (document.getElementById('checkpriv-root')) return;

    const rootContainer = document.createElement('div');
    rootContainer.id = 'checkpriv-root';
    document.body.appendChild(rootContainer);

    shadowRoot = rootContainer.attachShadow({ mode: 'open' });

    const estilo = document.createElement('style');
    estilo.textContent = `
        .checkpriv-card {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 320px;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            z-index: 999999;
            overflow: hidden;
            border: 1px solid #e2e8f0;
            transition: all 0.3s ease;
        }
        .checkpriv-header {
            background-color: #1e293b;
            color: #ffffff;
            padding: 12px 16px;
            font-size: 14px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .checkpriv-close {
            cursor: pointer;
            background: none;
            border: none;
            color: #94a3b8;
            font-size: 16px;
        }
        .checkpriv-close:hover { color: #ffffff; }
        .checkpriv-body {
            padding: 16px;
            font-size: 14px;
            color: #334155;
            line-height: 1.5;
        }
        .status-loading { border-left: 4px solid #3b82f6; }
        .status-danger { border-left: 4px solid #ef4444; background-color: #fef2f2; }
        .status-success { border-left: 4px solid #10b981; background-color: #f0fdf4; }
        
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            display: inline-block;
            vertical-align: middle;
            margin-right: 10px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    shadowRoot.appendChild(estilo);

    uiContainer = document.createElement('div');
    uiContainer.className = 'checkpriv-card status-loading';
    shadowRoot.appendChild(uiContainer);
};


let timerAutoFechar = null;

const atualizarUI = (status, titulo, message) => {
    criarInterface();
    uiContainer.className = `checkpriv-card status-${status}`;
    const iconeLoading = status === 'loading' ? '<div class="spinner"></div>' : '';



    if (timerAutoFechar) {
        clearTimeout(timerAutoFechar);
        timerAutoFechar = null;
    }


    const blocoFeedbackHTML = status !== 'loading' ? `
        <div id="checkpriv-feedback-box" style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; text-align: center; color: #555;">
            <p style="margin: 0 0 6px 0; font-weight: 600;">A recomendação te ajudou?</p>
            <div style="display: flex; justify-content: center; gap: 8px;">
                <button id="cp-fb-sim" style="cursor: pointer; padding: 2px 8px; border: 1px solid #ccc; border-radius: 4px; background: #fff; font-size: 11px;">👍 Sim</button>
                <button id="cp-fb-nao" style="cursor: pointer; padding: 2px 8px; border: 1px solid #ccc; border-radius: 4px; background: #fff; font-size: 11px;">👎 Não</button>
            </div>
        </div>
    ` : '';

    uiContainer.innerHTML = `
        <div class="checkpriv-header">
            <span>🔒 CheckPriv - O verificador de dados pessoais no SEI</span>
            <button class="checkpriv-close" id="close-dp-ui">×</button>
        </div>
        <div class="checkpriv-body">
            <strong style="display: block; margin-bottom: 6px;">${titulo}</strong>
            <div style="display: flex; align-items: center;">
                ${iconeLoading}
                <span>${message}</span>
            </div>
            ${blocoFeedbackHTML}
        </div>
    `;


    const fecharInterface = () => {
        if (timerAutoFechar) {
            clearTimeout(timerAutoFechar);
            timerAutoFechar = null;
        }
        const root = document.getElementById('checkpriv-root');
        if (root) root.remove();
    };


    const agendarFechamentoPosFeedback = () => {
        if (timerAutoFechar) clearTimeout(timerAutoFechar);
        timerAutoFechar = setTimeout(() => {
            fecharInterface();
        }, 3000);
    };


    uiContainer.querySelector('#close-dp-ui').addEventListener('click', fecharInterface);


    const btnSim = uiContainer.querySelector('#cp-fb-sim');
    const btnNao = uiContainer.querySelector('#cp-fb-nao');
    const boxFeedback = uiContainer.querySelector('#checkpriv-feedback-box');

    if (btnSim && btnNao) {
        btnSim.addEventListener('click', () => {
            registrarFeedback('sim', status);
            boxFeedback.innerHTML = '<span style="color: #2e7d32; font-weight: bold;">Obrigado pelo feedback! 🙏</span>';
            agendarFechamentoPosFeedback();
        });

        btnNao.addEventListener('click', () => {
            registrarFeedback('nao', status);
            boxFeedback.innerHTML = '<span style="color: #555;">Obrigado pelo retorno!</span>';
            agendarFechamentoPosFeedback();
        });
    }
};


const analisarDocumentoHTMLdoSEI = (documentoOrigem) => {
    try {
        atualizarUI('loading', 'Analisando Texto', 'Acessando o conteúdo do documento...');

        const iframeAlvo = documentoOrigem.getElementById('ifrVisualizacao') || document.getElementById('ifrVisualizacao');

        if (!iframeAlvo) {
            atualizarUI('danger', '❌ Erro de Leitura', 'Não foi possível localizar o documento para análise.');
            return;
        }

        let textoConsolidado = "";
        try {
  
            const docInterno = iframeAlvo.contentDocument || iframeAlvo.contentWindow.document;

            if (docInterno && docInterno.body) {
           
                const bodyClone = docInterno.body.cloneNode(true);


                const rodapesAutoria = Array.from(bodyClone.querySelectorAll('div[unselectable="on"]'));
    
                rodapesAutoria.forEach(rodape => {
                    if (rodape) rodape.remove();
                });
  
                const todasAsTabelas = Array.from(bodyClone.querySelectorAll('table'));
                    todasAsTabelas.forEach(tabela => {
                        const textoTabela = tabela.innerText || '';
               
                        if (textoTabela.includes('Referência:') && (textoTabela.includes('Processo nº') || textoTabela.includes('SEI nº'))) {
                            tabela.remove();
                        }
                });


                const possiveisCabecalhos = Array.from(bodyClone.querySelectorAll('table, div, p'));
                possiveisCabecalhos.forEach(elemento => {
                    const textoElemento = elemento.innerText || '';
                    if (
                        textoElemento.includes('UNIVERSIDADE FEDERAL DE MATO GROSSO') &&
                        textoElemento.includes('Av. Fernando Corrêa da Costa')
                    ) {
                        elemento.remove();
                    }
                });


                const scripts = bodyClone.querySelectorAll('script, style');
                scripts.forEach(s => s.remove());
                textoConsolidado = bodyClone.innerText;
            }
        } catch (e) {
            atualizarUI('danger', '❌ Erro de Permissão', 'Navegador bloqueou a leitura do frame.');
            return;
        }


        setTimeout(() => {
                  
            let achados = [];

            baseDeRiscos.forEach(risco => {
                if (risco.regex.test(textoConsolidado)) {
                    achados.push(risco.nome);
                }
            });


    const regexDocPublicoObrigatorio = /\b(ata de reuniã|ata de reuniao|portaria|ata de exame|ata de defesa|ata de qualificação)\b/i;
    const ehDocPublicoObrigatorio = regexDocPublicoObrigatorio.test(textoConsolidado.slice(0, 300));

    if (achados.length > 0) {
        const termosDetectados = achados.join(', ');


        if (ehDocPublicoObrigatorio) {
            atualizarUI(
                'danger',
                '⚠️ Atenção: Publicidade com Anonimização',
                `<div style="text-align: justify;">Este documento é um ato administrativo de interesse público (Ata ou Portaria), mas contém dados pessoais como <strong>${termosDetectados}</strong>.</div> 
                <br><br>
                <strong>⚙️ O que fazer:</strong><br>
                <div style="text-align: justify;">
                O CheckPriv recomenda manter o nível de acesso como <strong>Público</strong>, porém realizando a <strong>anonimização (tarjamento)</strong> dos dados pessoais antes da divulgação.</div>
                <br><br>
                <strong>💡 O que é anonimização?</strong><br>
                <div style="text-align: justify;">
                É a remoção ou ocultação de informações que identificam uma pessoa. <em>Exemplo: ocultar o CPF (ex: ***.123.456-**) ou tarjar o e-mail/telefone pessoal no texto antes de salvar a versão final.</em></div>
                <br><br>
                <strong>⚖️ Fundamento legal:</strong><br>
                <div style="text-align: justify;">
                Artigo 31 da LAI (Lei nº 12.527/2011), combinado com o Artigo 12 da LGPD (Lei nº 13.709/2018).<br>
                Este artigo determina que <strong>informações pessoais, mesmo em documentos públicos, só podem ser divulgadas sem restrição se os dados que identificam a pessoa forem removidos ou ocultados (anonimizados).</strong></div>`
            );
        } else {
            atualizarUI(
                'danger',
                '⚠️ Alerta de privacidade',
                `<div style="text-align: justify;">Foram encontrados dados pessoais, como <strong>${termosDetectados}</strong>.</div> 
                <br><br>
                <strong>⚙️ O que fazer:</strong><br>
                <div style="text-align: justify;">
                O CheckPriv recomenda que você revise o conteúdo e altere o nível de acesso deste documento para <strong>Restrito, hipótese legal: Informação Pessoal</strong> antes de assinar ou tramitar.</div>
                <br><br>
                <strong>⚖️ Fundamento legal:</strong><br>
                <div style="text-align: justify;">
                Artigo 5º, Inciso I da LGPD (Lei nº 13.709/2018).<br>
                Este artigo determina que <strong>qualquer informação pessoal que permita descobrir exatamente quem é o cidadão ou cidadã deve ser protegida por lei.</strong></div>`
            );
        }
    } else {
        atualizarUI(
            'success',
            '✅ Documento sem dados pessoais',
            `<div style="text-align: justify;">Nenhum dado pessoal foi detectado neste documento.</div>
            <br><br>
            <strong>⚙️ O que fazer:</strong><br>
            <div style="text-align: justify;">
            O CheckPriv recomenda que classifique o nível de acesso do documento como <strong>público</strong>.</div>
            <br><br>
            <strong>⚖️ Fundamento legal:</strong><br>
            <div style="text-align: justify;">
            Artigo 3º, Inciso I da LAI (Lei nº 12.527/2011).<br>
            Este artigo determina que <strong>a regra é que todo documento público deve ser livre para consulta, e o acesso restrito é apenas uma exceção.</strong></div>`
        );
    }
}, 600);

    } catch (error) {
        console.error("checkpriv: Erro crítico na análise direcionada:", error);
        atualizarUI('danger', '❌ Erro de Leitura', 'Falha ao processar o conteúdo do documento.');
    }
};


const analisarPDFInternoDoSEI = async (urlMapeada) => {
    try {
        atualizarUI(
            'loading',
            'Acessando o anexo',
            'Preparando o arquivo para análise...'
        );


        let pdfUrl = urlMapeada;

        if (!pdfUrl.startsWith('http')) {
            const urlBaseAtual =
                window.location.href.split('controlador.php')[0];

            pdfUrl = urlBaseAtual + pdfUrl;
        }

        console.log(
            'checkpriv: URL final do PDF:',
            pdfUrl
        );

        atualizarUI(
            'loading',
            'Baixando PDF',
            'Fazendo o download temporário em background...'
        );

        const response = await fetch(pdfUrl);

        if (!response.ok) {
            throw new Error('Falha ao baixar o PDF do SEI.');
        }

        const arrayBuffer = await response.arrayBuffer();
        const typedarray = new Uint8Array(arrayBuffer);

        atualizarUI(
            'loading',
            'Análise iniciada',
            'Processando páginas...'
        );

        const pdf = await pdfjsLib.getDocument({
            data: typedarray
        }).promise;

        console.log(
            `checkpriv: PDF carregado com ${pdf.numPages} página(s).`
        );

        let textoConsolidado = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            atualizarUI(
                'loading',
                'Lendo texto do PDF',
                `Analisando página ${i} de ${pdf.numPages}...`
            );

            const page = await pdf.getPage(i);

            const textContent = await page.getTextContent({
                normalizeWhitespace: true
            });

            const textItems = textContent.items
                .map(item => item.str)
                .filter(Boolean);

            const textoDaPagina = textItems
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

            textoConsolidado += `${textoDaPagina} `;
        }



        const achados = new Set();

        baseDeRiscos.forEach(risco => {
            risco.regex.lastIndex = 0;

            if (risco.regex.test(textoConsolidado)) {
                achados.add(risco.nome);
            }
        });


        if (achados.size === 0) {
            console.log(
                'checkpriv: Nenhum risco encontrado no texto nativo. ' +
                'Iniciando OCR forçado em todas as páginas.'
            );

            for (let i = 1; i <= pdf.numPages; i++) {
                atualizarUI(
                    'loading',
                    'Escaneando documento',
                    `Analisando página ${i} de ${pdf.numPages}...`
                );

                const page = await pdf.getPage(i);


                const viewport = page.getViewport({
                    scale: 2.5
                });

                const canvas = document.createElement('canvas');

                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);

                const context = canvas.getContext('2d', {
                    willReadFrequently: true
                });

                if (!context) {
                    throw new Error(
                        'Não foi possível criar o contexto 2D do canvas.'
                    );
                }


                context.save();
                context.fillStyle = '#ffffff';
                context.fillRect(
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );
                context.restore();

                await page.render({
                    canvasContext: context,
                    viewport
                }).promise;

                console.log(
                    'checkpriv: Canvas renderizado para OCR:',
                    {
                        pagina: i,
                        largura: canvas.width,
                        altura: canvas.height
                    }
                );

                const resultadoOCR = await Tesseract.recognize(
                    canvas,
                    'por',
                    {
                        logger: mensagem => {
                            console.log(
                                'checkpriv: OCR:',
                                mensagem.status,
                                mensagem.progress
                            );
                        }
                    }
                );

                const textoOCR = (
                    resultadoOCR?.data?.text || ''
                )
                    .replace(/\s+/g, ' ')
                    .trim();

                console.log(
                    `checkpriv: Texto OCR da página ${i}:`,
                    textoOCR.substring(0, 2000)
                );

                if (textoOCR) {
                    textoConsolidado += ` ${textoOCR}`;
                }


                baseDeRiscos.forEach(risco => {

                    risco.regex.lastIndex = 0;

                   const result = textoOCR.match(risco.regex);

                    if (risco.regex.test(textoOCR)) {
                        achados.add(risco.nome);
                    }
                });

   
                canvas.width = 0;
                canvas.height = 0;


                if (achados.size > 0) {
                    console.log(
                        `checkpriv: Risco detectado no OCR da página ${i}. ` +
                        'Interrompendo OCR antecipadamente.'
                    );

                    break;
                }
            }
        }


        if (achados.size > 0) {
            const termosDetectados = [...achados].join(', ');

            atualizarUI(
                'danger',
                '⚠️ Alerta de privacidade',
                `<div style="text-align: justify;">
                    Foram encontrados dados pessoais, como
                    <strong>${termosDetectados}</strong>.
                </div>

                <br><br>

                <strong>⚙️ O que fazer:</strong><br>

                <div style="text-align: justify;">
                    O CheckPriv recomenda que você revise o conteúdo
                    e altere o nível de acesso deste documento para
                    <strong>
                        Restrito, hipótese legal: Informação Pessoal
                    </strong>
                    antes de assinar ou tramitar.
                </div>

                <br><br>

                <strong>⚖️ Fundamento legal:</strong><br>

                <div style="text-align: justify;">
                    Artigo 5º, Inciso I da LGPD
                    (Lei nº 13.709/2018).<br>

                    Este artigo determina que
                    <strong>
                        qualquer informação pessoal que permita descobrir
                        exatamente quem é o cidadão ou cidadã deve ser
                        protegida por lei.
                    </strong>
                </div>`
            );
        } else {
            atualizarUI(
                'success',
                '✅ Documento sem dados pessoais',
                `<div style="text-align: justify;">
                    Nenhum dado pessoal foi detectado neste documento.
                </div>

                <br><br>

                <strong>⚙️ O que fazer:</strong><br>

                <div style="text-align: justify;">
                    O CheckPriv recomenda que classifique o nível de acesso
                    do documento como <strong>público</strong>.
                </div>

                <br><br>

                <strong>⚖️ Fundamento legal:</strong><br>

                <div style="text-align: justify;">
                    Artigo 3º, Inciso I da LAI
                    (Lei nº 12.527/2011).<br>

                    Este artigo determina que
                    <strong>
                        a regra é que todo documento público deve ser livre
                        para consulta, e o acesso restrito é apenas uma
                        exceção.
                    </strong>
                </div>`
            );
        }

    } catch (error) {
        console.error(
            'checkpriv: Erro ao processar PDF interno:',
            error
        );

        atualizarUI(
            'danger',
            '❌ Erro no Processamento',
            'Falha ao baixar ou ler o PDF interno do SEI.'
        );
    }
};

let workerOCR = null;

const processarUploadPDF = async (file) => {
    const isPDF =
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf');

    if (!isPDF) return;

    atualizarUI(
        'loading',
        'Análise iniciada',
        'Carregando o arquivo PDF...'
    );

    const fileReader = new FileReader();

    fileReader.onload = async function () {
        const typedarray = new Uint8Array(this.result);

        try {
            const pdf = await pdfjsLib.getDocument({
                data: typedarray
            }).promise;

            console.log(
                `checkpriv: PDF carregado com ${pdf.numPages} página(s).`
            );

            let textoConsolidado = '';


            for (let i = 1; i <= pdf.numPages; i++) {
                atualizarUI(
                    'loading',
                    'Lendo texto do PDF',
                    `Analisando página ${i} de ${pdf.numPages}...`
                );

                const page = await pdf.getPage(i);

                const textContent = await page.getTextContent({
                    normalizeWhitespace: true
                });

                const textItems = textContent.items
                    .map(item => item.str)
                    .filter(Boolean);

                const textoDaPagina = textItems
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                textoConsolidado += `${textoDaPagina} `;
            }


            const achados = new Set();

            baseDeRiscos.forEach(risco => {
                risco.regex.lastIndex = 0;

                if (risco.regex.test(textoConsolidado)) {
                    achados.add(risco.nome);
                }
            });


            if (achados.size === 0) {
                console.log(
                    'checkpriv: Nenhum risco encontrado no texto nativo. ' +
                    'Iniciando OCR em todas as páginas.'
                );

                for (let i = 1; i <= pdf.numPages; i++) {
                    atualizarUI(
                        'loading',
                        'Escaneando documento',
                        `Analisando página ${i} de ${pdf.numPages}...`
                    );

                    const page = await pdf.getPage(i);

                    if (!workerOCR) {
    console.log('checkpriv: Inicializando worker OCR em português...');

    workerOCR = await Tesseract.createWorker('por', 1, {
        logger: mensagem => {
            console.log(
                'checkpriv: OCR:',
                mensagem.status,
                mensagem.progress
            );
        }
    });

    console.log('checkpriv: Worker OCR inicializado.');
}

const viewport = page.getViewport({
    scale: 2.5
});

const canvas = document.createElement('canvas');

canvas.width = Math.floor(viewport.width);
canvas.height = Math.floor(viewport.height);

const context = canvas.getContext('2d', {
    willReadFrequently: true
});

if (!context) {
    throw new Error('Não foi possível criar o contexto 2D do canvas.');
}


context.save();
context.fillStyle = '#ffffff';
context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
);
context.restore();

await page.render({
    canvasContext: context,
    viewport
}).promise;

console.log('checkpriv: Canvas renderizado para OCR:', {
    pagina: i,
    largura: canvas.width,
    altura: canvas.height
});

const resultadoOCR = await workerOCR.recognize(canvas);

const textoOCR = (
    resultadoOCR?.data?.text || ''
)
    .replace(/\s+/g, ' ')
    .trim();



                    if (textoOCR) {
                        textoConsolidado += ` ${textoOCR}`;
                    }


                    baseDeRiscos.forEach(risco => {
                        risco.regex.lastIndex = 0;

                        if (risco.regex.test(textoOCR)) {
                            achados.add(risco.nome);
                        }
                    });


                    canvas.width = 0;
                    canvas.height = 0;

                    if (achados.size > 0) {
                        console.log(
                            `checkpriv: Risco encontrado no OCR ` +
                            `da página ${i}. OCR interrompido.`
                        );

                        break;
                    }
                }
            }

            registrarUsoMetrica();

            if (achados.size > 0) {
                const termosDetectados = [...achados].join(', ');

                atualizarUI(
                    'danger',
                    '⚠️ Alerta de privacidade',
                    `<div style="text-align: justify;">
                        Foram encontrados dados pessoais, como
                        <strong>${termosDetectados}</strong>.
                    </div>

                    <br><br>

                    <strong>⚙️ O que fazer:</strong><br>

                    <div style="text-align: justify;">
                        O CheckPriv recomenda que você revise o conteúdo
                        e altere o nível de acesso deste documento para
                        <strong>
                            Restrito, hipótese legal: Informação Pessoal
                        </strong>
                        antes de assinar ou tramitar.
                    </div>

                    <br><br>

                    <strong>⚖️ Fundamento legal:</strong><br>

                    <div style="text-align: justify;">
                        Artigo 5º, Inciso I da LGPD
                        (Lei nº 13.709/2018).<br>

                        Este artigo determina que
                        <strong>
                            qualquer informação pessoal que permita descobrir
                            exatamente quem é o cidadão ou cidadã deve ser
                            protegida por lei.
                        </strong>
                    </div>`
                );
            } else {
                atualizarUI(
                    'success',
                    '✅ Documento sem dados pessoais',
                    `<div style="text-align: justify;">
                        Nenhum dado pessoal foi detectado neste documento.
                    </div>

                    <br><br>

                    <strong>⚙️ O que fazer:</strong><br>

                    <div style="text-align: justify;">
                        O CheckPriv recomenda que classifique o nível de acesso
                        do documento como <strong>público</strong>.
                    </div>

                    <br><br>

                    <strong>⚖️ Fundamento legal:</strong><br>

                    <div style="text-align: justify;">
                        Artigo 3º, Inciso I da LAI
                        (Lei nº 12.527/2011).<br>

                        Este artigo determina que
                        <strong>
                            a regra é que todo documento público deve ser livre
                            para consulta, e o acesso restrito é apenas uma
                            exceção.
                        </strong>
                    </div>`
                );
            }

        } catch (error) {
            console.error(
                'checkpriv: ERRO GRAVE ao processar PDF:',
                error
            );

            atualizarUI(
                'danger',
                '❌ Erro no Processamento',
                'Falha ao ler ou analisar o PDF anexado.'
            );
        }
    };

    fileReader.onerror = () => {
        console.error(
            'checkpriv: Erro ao ler o arquivo PDF.'
        );

        atualizarUI(
            'danger',
            '❌ Erro no Processamento',
            'Não foi possível ler o arquivo PDF anexado.'
        );
    };

    fileReader.readAsArrayBuffer(file);
};


const injetarBotaoNoSEI = () => {
    let barraComandos = null;
    let documentoAlvo = document;

    barraComandos = document.getElementById('divArvoreAcoes');

    if (!barraComandos) {
        const iframeVisualizacao = document.getElementById('ifrVisualizacao');
        if (iframeVisualizacao) {
            try {
                documentoAlvo = iframeVisualizacao.contentDocument || iframeVisualizacao.contentWindow.document;
                barraComandos = documentoAlvo.getElementById('divArvoreAcoes');
            } catch (e) {
                return;
            }
        }
    }

    if (!barraComandos) return;

    const mapearLinksBarra = barraComandos.innerHTML;
    if (!mapearLinksBarra.includes('id_documento=')) {
        const botaoErrado = barraComandos.querySelector('#btn-checkpriv-sei') || documentoAlvo.getElementById('btn-checkpriv-sei');
        if (botaoErrado) botaoErrado.remove();
        return;
    }

    if (documentoAlvo.getElementById('btn-checkpriv-sei') || barraComandos.querySelector('#btn-checkpriv-sei')) {
        return;
    }

    const urlIcone = chrome.runtime.getURL('cadeado.svg');

   
    const novoBotao = documentoAlvo.createElement('a');
    novoBotao.id = 'btn-checkpriv-sei';
    novoBotao.href = '#';
    novoBotao.tabIndex = 452;
    novoBotao.title = 'CheckPriv - O verificador de dados pessoais no SEI';

   
    novoBotao.innerHTML = `
        <img src="${urlIcone}" alt="Verificar dados pessoais" title="CheckPriv" style="width: 30px; height: 30px;">
    `;
novoBotao.addEventListener('click', (e) => {

    registrarUsoMetrica();

        e.preventDefault();
        
    

        let divInfo = documentoAlvo.getElementById('divArvoreInformacao') || document.getElementById('divArvoreInformacao');
        
        if (!divInfo) {
            const iframeViz = document.getElementById('ifrVisualizacao') || document.querySelector('iframe[name="ifrVisualizacao"]');
            if (iframeViz) {
                try {
                    const docInterno = iframeViz.contentDocument || iframeViz.contentWindow.document;
                    divInfo = docInterno.getElementById('divArvoreInformacao');
                } catch (err) {
                    console.log("checkpriv: Não foi possível acessar o iframe interno por segurança, mas continuaremos a busca.");
                }
            }
        }

  
        if (divInfo) {
            const linkAncora = divInfo.querySelector('a.ancoraVisualizacaoArvore');
            
            if (linkAncora) {
                const urlDownloadPDF = linkAncora.getAttribute('href');
                
                analisarPDFInternoDoSEI(urlDownloadPDF);
                return; 
            }
        }

        analisarDocumentoHTMLdoSEI(documentoAlvo);
    });


    barraComandos.appendChild(novoBotao);
};


const estaNoSEI =
    window.location.hostname === 'sei.ufmt.br' &&
    window.location.pathname.startsWith('/sei/');

if (estaNoSEI) {
    document.body.addEventListener('change', (event) => {
        const input = event.target;

        if (!input || input.type !== 'file' || !input.files || input.files.length === 0) {
            return;
        }

        const inputPertenceAoSEI =
            input.closest('form') ||
            input.closest('#divInfraAreaDados') ||
            input.closest('.infraFormulario');

        if (!inputPertenceAoSEI) {
            return;
        }

        processarUploadPDF(input.files[0]);
    }, true);
}


const intervaloInjecao = setInterval(() => {
    
    if (!chrome.runtime || !chrome.runtime.id) {
        clearInterval(intervaloInjecao);
        return;
    }
    injetarBotaoNoSEI();
}, 1000);

injetarBotaoNoSEI();
setInterval(injetarBotaoNoSEI, 1000);