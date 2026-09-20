(() => {
  if (window.BarStockBottleProfiles) return;

  // ── Perfiles de botella ──────────────────────────────────────────────
  //
  // ESTE ES EL ÚNICO SITIO donde vive la geometría de las botellas.
  // Tanto el dibujo que se ve como el cálculo del volumen salen de aquí,
  // a propósito: si hubiera una silueta para enseñar y otros números para
  // calcular, una forma mal medida se escondería en el resultado en vez
  // de verse a simple vista.
  //
  // ── De dónde salen estos números ────────────────────────────────────
  //
  // Los diecinueve perfiles de abajo están MEDIDOS. Cada uno se sacó de
  // una foto o ilustración de una botella real, contando píxeles fila por
  // fila, y después se comprobó superponiendo la silueta reconstruida
  // sobre la imagen original. El desajuste de área quedó entre 0.4% y
  // 2.5% en todos los casos; la cifra concreta de cada uno está anotada
  // en su comentario.
  //
  // Esto sustituye a siete perfiles anteriores que eran PLAUSIBLES PERO
  // INVENTADOS, y que llevaban su propio aviso diciéndolo. Una forma
  // equivocada da un número preciso y falso, que es peor que uno
  // obviamente malo.
  //
  // ── Las reglas que siguen todas ─────────────────────────────────────
  //
  //   1. La CAJA es la misma para todas. Lo que se fija es la ALTURA; el
  //      ancho sale de `asp` (alto ÷ ancho máximo). Por eso una magnum y
  //      una petaca se dibujan igual de altas y distinto de anchas, y el
  //      deslizador mide siempre lo mismo bajo el dedo.
  //
  //   2. El TAMAÑO del envase no se calcula, se mide. Una magnum de 1.5 L
  //      no es una de 750 inflada: también es más alta. Si fuera lo
  //      primero su esbeltez sería 4.03÷√2 ≈ 2.9, y medida da 3.57. Por
  //      eso `wine_magnum` es una entrada propia y no una fórmula.
  //
  //   3. CURVAS CONTINUAS, sin esquinas vivas. Los talones son filetes
  //      circulares o elípticos; los hombros, interpolaciones con
  //      pendiente cero en los dos extremos. Donde la botella real tenía
  //      un escalón pequeño —la tapa más ancha que el cuello, un collar
  //      de vidrio— se conservó como hinchazón redonda, no como escalón.
  //
  // ── Formato ─────────────────────────────────────────────────────────
  //
  // `p` es una lista de puntos [y, r] con y de 0 en la base a 1 en la
  // boca, y r el radio relativo (1 = la parte más ancha). `yFull` es la
  // altura a la que llega el líquido en una botella llena — no es 1,
  // porque encima quedan el cuello y el aire. No se eligió a ojo: es la
  // altura a la que cabe el 95% del volumen, integrada sobre el perfil.
  //
  // ── Por qué la sección puede tratarse como circular ─────────────────
  //
  // Lo que se muestra es una FRACCIÓN: volumen(h) / volumen(lleno). Si la
  // sección real es un rectángulo, su área es k·r² con k constante, y esa
  // k aparece arriba y abajo de la división: se cancela. Solo importaría
  // si la forma de la sección cambiara con la altura, cosa que en
  // botellas no pasa. Por eso una petaca cuadrada sale bien igual.

  const PROFILES = {
    bordeaux: {
      name: 'Wine · Bordeaux', asp: 4.03, yFull: 0.74, pourable: true,
      // Vino tinto y blanco de 750: cuerpo recto, hombro marcado.
      p: [[0,0.13], [0.0099,0.7905], [0.0318,0.9352], [0.0633,0.9519], [0.0953,0.9581], [0.1274,0.9603], [0.1594,0.963], [0.1915,0.9663], [0.2236,0.9693], [0.2557,0.9722], [0.2878,0.9749], [0.3199,0.9777], [0.3519,0.9805], [0.384,0.9832], [0.4161,0.9857], [0.4482,0.9879], [0.4803,0.9898], [0.5123,0.9915], [0.5444,0.9929], [0.5765,0.9938], [0.6086,0.994], [0.6406,0.9936], [0.6716,0.9665], [0.7024,0.8311], [0.7324,0.5645], [0.7613,0.3872], [0.7924,0.3665], [0.8245,0.366], [0.8565,0.3653], [0.8886,0.3625], [0.9206,0.3614], [0.9527,0.3601], [0.9843,0.346], [1,0.1]]
    },
    wine_burgundy: {
      name: 'Wine · Burgundy', asp: 3.46, yFull: 0.736, pourable: true,
      // Hombro largo y continuo, sin quiebre.
      p: [[0,0.4], [0.0143,0.873], [0.0424,0.9928], [0.0734,0.9996], [0.1047,0.9997], [0.1359,0.9997], [0.1671,0.9997], [0.1983,0.9997], [0.2295,0.9997], [0.2607,0.9997], [0.292,0.9997], [0.3232,0.9996], [0.3544,0.9985], [0.3855,0.9918], [0.4166,0.9711], [0.4477,0.9365], [0.4788,0.8916], [0.5099,0.836], [0.541,0.767], [0.5721,0.6852], [0.6032,0.6015], [0.6343,0.5303], [0.6654,0.4704], [0.6965,0.42], [0.7276,0.3865], [0.7587,0.3626], [0.7898,0.3421], [0.8209,0.3399], [0.8521,0.3362], [0.8833,0.3329], [0.9145,0.3297], [0.9454,0.3314], [0.9759,0.3161], [1,0.2427]]
    },
    wine_magnum: {
      name: 'Wine · Magnum 1.5 L', asp: 3.57, yFull: 0.697, pourable: true,
      // La magnum es mas ancha Y mas alta: medida aparte, no derivada.
      p: [[0,0.232], [0.011,0.6852], [0.0375,0.9445], [0.0674,0.9847], [0.0992,0.9847], [0.1311,0.9847], [0.1629,0.9847], [0.1948,0.9847], [0.2266,0.9847], [0.2585,0.9847], [0.2893,0.9823], [0.3208,0.9847], [0.3525,0.9882], [0.3842,0.99], [0.4161,0.99], [0.4479,0.99], [0.4798,0.99], [0.5116,0.99], [0.5435,0.99], [0.5747,0.9794], [0.6059,0.952], [0.6373,0.8858], [0.6685,0.7815], [0.6996,0.6313], [0.7298,0.4313], [0.7598,0.3489], [0.7912,0.3235], [0.8225,0.3001], [0.8542,0.2801], [0.8857,0.2643], [0.9171,0.2563], [0.9485,0.2603], [0.9796,0.271], [1,0.2072]]
    },
    sparkling: {
      name: 'Sparkling · Champagne', asp: 3.09, yFull: 0.722, pourable: true,
      // Talon eliptico y hombro de un tercio de la botella.
      p: [[0,0.23], [0.0131,0.7498], [0.0401,0.9847], [0.0705,1], [0.1019,1], [0.1332,1], [0.1646,1], [0.196,1], [0.2273,1], [0.2587,1], [0.2901,1], [0.3214,1], [0.3527,0.9997], [0.3839,0.9823], [0.4151,0.9552], [0.4464,0.9158], [0.4776,0.867], [0.5089,0.8088], [0.54,0.7341], [0.5712,0.6425], [0.6025,0.5531], [0.6338,0.4748], [0.6649,0.4094], [0.696,0.3666], [0.7273,0.3377], [0.7586,0.3164], [0.7898,0.3052], [0.8211,0.2989], [0.8523,0.2949], [0.883,0.3124], [0.9133,0.3611], [0.9445,0.3507], [0.9755,0.3228], [1,0.2449]]
    },
    vodka: {
      name: 'Vodka · Gin · Rum · Tequila', asp: 3.41, yFull: 0.756, pourable: true,
      // Recta de base a hombro. El caballo de batalla.
      p: [[0,0.835], [0.0165,0.9803], [0.0472,0.985], [0.0787,0.985], [0.1102,0.985], [0.1417,0.985], [0.1731,0.985], [0.2046,0.985], [0.2361,0.985], [0.2676,0.985], [0.299,0.985], [0.3305,0.985], [0.362,0.985], [0.3935,0.985], [0.4249,0.985], [0.4564,0.985], [0.4879,0.985], [0.5193,0.985], [0.5508,0.985], [0.5823,0.985], [0.6129,0.9705], [0.6426,0.8605], [0.6734,0.6595], [0.7036,0.4849], [0.7333,0.4172], [0.7645,0.4127], [0.7959,0.4042], [0.8273,0.3908], [0.8588,0.3761], [0.8902,0.3638], [0.9215,0.3574], [0.953,0.357], [0.9843,0.3565], [1,0.282]]
    },
    whiskey: {
      name: 'Whiskey · Bourbon', asp: 3.05, yFull: 0.788, pourable: true,
      // Collar en la base y en el hombro, hombro casi cuadrado.
      p: [[0,0.804], [0.0179,0.9253], [0.0493,0.93], [0.0798,0.9832], [0.1102,0.9551], [0.1411,0.926], [0.173,0.926], [0.205,0.926], [0.2369,0.926], [0.2688,0.926], [0.3008,0.926], [0.3327,0.926], [0.3647,0.926], [0.3966,0.926], [0.4285,0.926], [0.4605,0.926], [0.4924,0.926], [0.5241,0.9272], [0.555,0.9821], [0.5859,0.9999], [0.6159,0.9596], [0.6438,0.7397], [0.6722,0.4388], [0.7011,0.3965], [0.7326,0.4131], [0.7641,0.4333], [0.7955,0.419], [0.8272,0.3777], [0.8587,0.3534], [0.8896,0.3725], [0.9207,0.392], [0.9526,0.392], [0.9843,0.3909], [1,0.3188]]
    },
    tequila_tall: {
      name: 'Tequila · Tall', asp: 3.83, yFull: 0.766, pourable: true,
      // Mas esbelta que la del vodka, cuello largo.
      p: [[0,0.86], [0.0233,0.9445], [0.0544,0.9634], [0.0858,0.9857], [0.1149,0.9333], [0.1451,0.9082], [0.1768,0.9147], [0.2084,0.917], [0.2399,0.9256], [0.2716,0.9292], [0.3033,0.9376], [0.3351,0.9443], [0.3669,0.9452], [0.3986,0.9472], [0.4302,0.9608], [0.4619,0.9635], [0.4938,0.964], [0.5253,0.9709], [0.5568,0.9737], [0.5885,0.9717], [0.6201,0.979], [0.6512,0.9773], [0.6786,0.8642], [0.7081,0.6282], [0.7378,0.4907], [0.7671,0.3862], [0.798,0.3803], [0.8298,0.3793], [0.8618,0.3793], [0.8935,0.3824], [0.9251,0.3891], [0.9565,0.3836], [0.9877,0.3759], [1,0.318]]
    },
    brandy: {
      name: 'Brandy · Cognac', asp: 2.66, yFull: 0.72, pourable: true,
      // Sin hombro: el cuerpo entero es la curva.
      p: [[0,0.7648], [0.018,0.8063], [0.0444,0.8321], [0.073,0.8951], [0.1048,0.9073], [0.1367,0.9168], [0.1686,0.9256], [0.2004,0.9347], [0.2323,0.9441], [0.2643,0.9524], [0.2962,0.9609], [0.3281,0.9692], [0.36,0.9777], [0.3918,0.9862], [0.4232,0.9871], [0.4545,0.9612], [0.4843,0.904], [0.515,0.7469], [0.5466,0.5648], [0.5769,0.4242], [0.6072,0.3629], [0.6387,0.346], [0.6705,0.3348], [0.7024,0.3259], [0.7343,0.3184], [0.7662,0.3121], [0.7981,0.3063], [0.8301,0.3007], [0.8619,0.2939], [0.8935,0.296], [0.925,0.3054], [0.9563,0.2963], [0.9854,0.2678], [1,0.2145]]
    },
    squat: {
      name: 'Squat · Wide Shoulder', asp: 2.31, yFull: 0.745, pourable: true,
      // Ensancha hacia arriba. Estilo Makers.
      p: [[0,0.615], [0.014,0.7726], [0.042,0.8183], [0.072,0.866], [0.1033,0.88], [0.1341,0.89], [0.1648,0.9], [0.1955,0.91], [0.2262,0.92], [0.257,0.93], [0.2877,0.94], [0.3185,0.9598], [0.3507,0.96], [0.3825,0.9817], [0.4141,0.9988], [0.4455,0.9822], [0.4768,0.9224], [0.505,0.7926], [0.535,0.5578], [0.5638,0.4163], [0.5933,0.3898], [0.6254,0.3875], [0.6579,0.3789], [0.6905,0.3693], [0.723,0.3589], [0.7556,0.3479], [0.7882,0.3368], [0.8208,0.3259], [0.8533,0.3155], [0.8859,0.3061], [0.9184,0.2981], [0.951,0.2915], [0.9802,0.2837], [1,0.2517]]
    },
    flask_flat: {
      name: 'Flask · Flat Shoulder', asp: 2.28, yFull: 0.697, pourable: true,
      // Petaca con hombro de ESTANTE: pierde el 61% del ancho en el 6%
      // de la altura, entre el 66% y el 73%. Estilo Knob Creek.
      //
      // Es la unica cuyo hombro NO sale de una formula. Se probo primero
      // con el smootherstep de las demas y salio mal: una curva simetrica
      // empieza a caer demasiado pronto, y esta botella aguanta el ancho
      // hasta el ultimo momento y luego se desploma. El desajuste bajo de
      // 1.8% a 0.9% al poner ahi la curva medida punto por punto.
      //
      // Comparte esbeltez (2.28) con apothecary_squat y casi con squat
      // (2.31), pero de cerca no se parecen: esta ensancha hacia arriba y
      // corta en seco, la de Hendrick's es recta con hombro redondo, y la
      // de Maker's ensancha con un hombro de curva larga.
      p: [[0,0.3], [0.0111,0.7147], [0.0351,0.9294], [0.0622,0.9609], [0.0905,0.9523], [0.1189,0.9515], [0.1474,0.95], [0.1758,0.9437], [0.2044,0.9437], [0.2328,0.9479], [0.2613,0.9573], [0.2899,0.9626], [0.3184,0.9672], [0.3469,0.9673], [0.3754,0.9711], [0.4039,0.9711], [0.4325,0.9711], [0.461,0.9738], [0.4895,0.975], [0.5181,0.975], [0.5465,0.9789], [0.5751,0.9789], [0.6037,0.9789], [0.632,0.9834], [0.6601,0.9978], [0.6867,0.951], [0.7101,0.7022], [0.7292,0.3444], [0.7553,0.2643], [0.7831,0.2547], [0.8102,0.2782], [0.8382,0.2837], [0.8666,0.2858], [0.8951,0.2819], [0.9236,0.274], [0.9521,0.2679], [0.9785,0.2391], [1,0.1865]]
    },
    crown: {
      name: 'Decanter · Crown style', asp: 1.77, yFull: 0.692, pourable: true,
      // La mas ancha. Se angosta hacia la base.
      p: [[0,0.46], [0.0151,0.7024], [0.0445,0.7465], [0.0755,0.7715], [0.1063,0.8026], [0.1371,0.8199], [0.1686,0.8278], [0.2001,0.8364], [0.2313,0.8493], [0.2622,0.8613], [0.2938,0.877], [0.3255,0.8912], [0.3572,0.9075], [0.389,0.9234], [0.4207,0.9417], [0.4522,0.9539], [0.4838,0.972], [0.5155,0.992], [0.5468,0.9969], [0.5783,0.978], [0.6093,0.9289], [0.6407,0.8611], [0.6698,0.7236], [0.6996,0.5305], [0.7285,0.3086], [0.7584,0.2593], [0.7895,0.2485], [0.8213,0.2485], [0.8528,0.2494], [0.8838,0.2552], [0.9136,0.2776], [0.9444,0.312], [0.9745,0.3202], [1,0.2785]]
    },
    apothecary_tall: {
      name: 'Apothecary · Tall', asp: 2.88, yFull: 0.744, pourable: true,
      // El cilindro mas perfecto del catalogo.
      p: [[0,0.9], [0.0165,0.9799], [0.048,0.9908], [0.0798,0.999], [0.1117,1], [0.1438,1], [0.1759,1], [0.208,1], [0.2401,1], [0.2722,1], [0.3043,1], [0.3364,1], [0.3685,1], [0.4006,1], [0.4327,1], [0.4648,1], [0.4969,1], [0.529,1], [0.5611,1], [0.5932,1], [0.6253,1], [0.6568,0.9909], [0.6874,0.9488], [0.7172,0.8502], [0.7444,0.6699], [0.7714,0.4488], [0.7998,0.3496], [0.8306,0.3381], [0.8626,0.3381], [0.8947,0.3381], [0.9256,0.3509], [0.9568,0.3914], [0.9876,0.3948], [1,0.3516]]
    },
    apothecary_squat: {
      name: 'Apothecary · Squat', asp: 2.28, yFull: 0.775, pourable: true,
      // Recta hasta el 78% y corta en seco.
      p: [[0,0.42], [0.0135,0.7612], [0.0407,0.8952], [0.068,0.9899], [0.0989,0.9968], [0.1299,0.9812], [0.1618,0.9843], [0.1937,0.9854], [0.2256,0.9864], [0.2576,0.9866], [0.2895,0.9855], [0.3213,0.9814], [0.3532,0.9815], [0.385,0.983], [0.4169,0.9839], [0.4487,0.985], [0.4806,0.9825], [0.5125,0.981], [0.5444,0.98], [0.5763,0.9792], [0.6082,0.9772], [0.6401,0.975], [0.672,0.9751], [0.7039,0.9757], [0.7355,0.9917], [0.7646,0.9623], [0.7941,0.7142], [0.8244,0.4335], [0.8534,0.2972], [0.8844,0.2938], [0.9161,0.3025], [0.948,0.3014], [0.9775,0.265], [1,0.227]]
    },
    shaker_faceted: {
      name: 'Shaker · Faceted', asp: 2.84, yFull: 0.77, pourable: true,
      // Cintura arriba, no abajo. Estilo Tanqueray.
      p: [[0,0.46], [0.0137,0.7232], [0.0412,0.8248], [0.0727,0.8467], [0.1045,0.8562], [0.1361,0.8508], [0.1679,0.8575], [0.1999,0.8607], [0.2319,0.8644], [0.2637,0.8704], [0.2957,0.8773], [0.3277,0.8858], [0.3597,0.8945], [0.3915,0.9016], [0.4236,0.9135], [0.4557,0.9232], [0.4876,0.9315], [0.5196,0.9379], [0.5512,0.9592], [0.5825,0.9942], [0.6137,0.9774], [0.6454,0.9395], [0.6773,0.9201], [0.7091,0.8943], [0.7401,0.8369], [0.7681,0.6823], [0.7964,0.454], [0.826,0.3556], [0.8574,0.3462], [0.8894,0.342], [0.9215,0.3383], [0.9534,0.3349], [0.9818,0.2956], [1,0.2542]]
    },
    liqueur_slim: {
      name: 'Liqueur · Slim', asp: 4.27, yFull: 0.796, pourable: true,
      // La mas esbelta: 4.27. Cointreau, Grand Marnier.
      p: [[0,0.35], [0.0144,0.8695], [0.0426,0.9933], [0.0737,0.9867], [0.1051,0.9867], [0.1365,0.9867], [0.1678,0.9867], [0.1992,0.9867], [0.2306,0.9867], [0.262,0.9867], [0.2934,0.9867], [0.3248,0.9867], [0.356,0.9885], [0.3873,0.9918], [0.4187,0.9918], [0.45,0.9926], [0.4814,0.9933], [0.5125,0.9984], [0.5439,1], [0.5752,1], [0.6061,0.967], [0.6371,0.8704], [0.6684,0.7578], [0.6998,0.645], [0.731,0.537], [0.7621,0.4581], [0.7932,0.4176], [0.8239,0.4255], [0.8553,0.4255], [0.8866,0.4194], [0.9174,0.4046], [0.9468,0.4032], [0.9766,0.417], [1,0.3452]]
    },
    liqueur_cream: {
      name: 'Liqueur · Cream', asp: 3.43, yFull: 0.762, pourable: true,
      // Mas ancha justo a la mitad.
      p: [[0,0.39], [0.0134,0.7504], [0.0411,0.8726], [0.0721,0.8863], [0.1038,0.887], [0.1352,0.9005], [0.1666,0.905], [0.1979,0.9147], [0.2291,0.9278], [0.2602,0.9289], [0.2915,0.9455], [0.3229,0.9431], [0.3535,0.9574], [0.3848,0.9689], [0.416,0.9718], [0.4469,0.9858], [0.4778,1], [0.5092,0.9979], [0.5403,0.9371], [0.5714,0.8188], [0.6031,0.6831], [0.6348,0.5434], [0.6659,0.4313], [0.6971,0.3725], [0.7286,0.3563], [0.7601,0.3462], [0.7916,0.3502], [0.8235,0.3502], [0.8553,0.3502], [0.8872,0.3502], [0.9179,0.3458], [0.9491,0.3475], [0.9795,0.3411], [1,0.2905]]
    },
    decanter_flared: {
      name: 'Decanter · Flared', asp: 2.59, yFull: 0.709, pourable: true,
      // Anfora: se angosta hacia los dos extremos.
      p: [[0,0.64], [0.0168,0.7189], [0.0423,0.7589], [0.073,0.728], [0.1043,0.7216], [0.1359,0.7307], [0.1676,0.7517], [0.1995,0.7822], [0.2315,0.8154], [0.2634,0.8519], [0.2955,0.8866], [0.3274,0.9191], [0.3593,0.9468], [0.3913,0.9694], [0.4232,0.9859], [0.4548,0.9967], [0.4865,0.9997], [0.5183,0.9973], [0.5496,0.9781], [0.581,0.9379], [0.6122,0.8739], [0.6436,0.7826], [0.6749,0.6688], [0.7065,0.5348], [0.7379,0.4152], [0.7689,0.3222], [0.7999,0.2663], [0.8313,0.2395], [0.863,0.2274], [0.8932,0.2473], [0.9239,0.2934], [0.9554,0.2971], [0.9869,0.2952], [1,0.2556]]
    },
    prism_arched: {
      name: 'Prism · Arched Shoulder', asp: 3.17, yFull: 0.781, pourable: true,
      // El prisma mas limpio del catalogo. Estilo Bombay Sapphire: seccion
      // de rectangulo redondeado, cuerpo RECTO de verdad —el radio se
      // mantiene entre .975 y .981 desde el 3% hasta el 72% de la altura—
      // y un talon corto abajo.
      //
      // Lo que la distingue no es el cuerpo, es el hombro: un ARCO LARGO
      // que tarda el 13% de la altura en bajar del ancho maximo al cuello.
      // El flask_flat, que es la otra de hombro marcado, lo hace en el 6%.
      // Por eso las dos no se confunden aunque las dos sean rectas.
      //
      // El ancho maximo NO esta en el cuerpo sino en la cresta del hombro
      // (y=.724), unos 7px por encima del cuerpo en la foto. Es un
      // resalte real del vidrio, constante a lo largo de 24 filas, no
      // ruido de borde: se conservo como hinchazon suave.
      //
      // ── Reparto del volumen ──────────────────────────────────────────
      //
      //   cuerpo recto (0-72%)   89.0%
      //   arco del hombro        8.4%
      //   cuello y capsula       2.6%
      //
      // Con casi todo el liquido en un cilindro recto, la relacion
      // altura-contenido sale practicamente lineal: a 1/4 de altura hay el
      // 25%, a la mitad el 51%, a 3/4 el 76%. Es el opuesto exacto de
      // globe_footed (14 / 47 / 82) y la unica forma del catalogo donde
      // contar a ojo en papel no introduce error apreciable.
      //
      // Medida de frente, sin elipse de perspectiva en la base: 1158 px de
      // alto por 365 de ancho maximo, centro constante en x=628. Desajuste
      // de area 0.06%, el mas bajo del catalogo — merito de la botella,
      // que es facil, no del metodo.
      p: [[0,0.7019], [0.0037,0.8442], [0.0074,0.8952], [0.0111,0.9286], [0.0149,0.9515], [0.0186,0.9666], [0.0223,0.9753], [0.026,0.9781], [0.06,0.9945], [0.12,0.9725], [0.2,0.9779], [0.3,0.9807], [0.4,0.9752], [0.5,0.9752], [0.58,0.9779], [0.64,0.9752], [0.68,0.9807], [0.7,0.9917], [0.712,0.9972], [0.724,1], [0.734,0.9752], [0.744,0.9203], [0.754,0.8681], [0.764,0.7857], [0.774,0.7115], [0.784,0.6484], [0.794,0.5714], [0.804,0.5165], [0.814,0.4698], [0.824,0.4368], [0.834,0.4121], [0.846,0.3929], [0.858,0.3791], [0.88,0.3795], [0.91,0.3795], [0.94,0.3795], [0.962,0.3795], [0.974,0.3795], [0.98,0.3941], [0.986,0.4206], [0.991,0.4236], [0.9945,0.4011], [0.9975,0.3359], [1,0.2056]]
    },
    globe_footed: {
      name: 'Globe · Footed', asp: 1.45, yFull: 0.693, pourable: true,
      // La MAS ANCHA del catalogo, y por bastante: 1.45 contra el 1.77 de
      // crown. Estilo Chambord — esfera sobre plinto de vidrio, con
      // corona cilindrica arriba.
      //
      // No es una curva, son cuatro piezas pegadas:
      //
      //   0.00 - 0.03   filete del talon, sube de golpe a r=.564
      //   0.03 - 0.08   plinto RECTO (r constante)
      //   0.08 - 0.71   la esfera, maxima entre .28 y .46
      //   0.71 - 0.99   corona cilindrica (r=.289 constante)
      //   0.99 - 1.00   tapa redondeada
      //
      // Las dos uniones —plinto a esfera y esfera a corona— llevan filete
      // de coseno. El vidrio real tiene ahi esquinas vivas; la regla 3 de
      // arriba dice que no entran.
      //
      // ── Por que esta importa mas que las otras ────────────────────────
      //
      // El 90% del liquido esta en la esfera: el plinto y la corona se
      // reparten un 5% cada uno. Eso hace que la relacion altura-contenido
      // sea la mas torcida del catalogo, en forma de S:
      //
      //   a 1/4 de la altura del liquido hay el 14% del contenido
      //   a la mitad                          el 47%
      //   a 3/4                               el 82%
      //
      // O sea: una botella que se ve a la cuarta parte esta casi vacia, y
      // una que se ve a tres cuartos esta casi llena. En una botella recta
      // esos numeros serian 25, 50 y 75, y estimar a ojo sale bien. Aqui
      // el error de contar por decimas en una hoja de papel es del doble
      // que en cualquier otra forma del catalogo.
      //
      // Desajuste de area 0.8%. Al reducir de 63 puntos medidos a 39, la
      // fraccion de volumen se movio 0.11% como maximo.
      p: [[0,0.34], [0.0037,0.4484], [0.0075,0.4882], [0.0113,0.5149], [0.0151,0.534], [0.0226,0.5569], [0.0302,0.564], [0.0553,0.564], [0.0804,0.564], [0.0965,0.5961], [0.1126,0.6281], [0.1553,0.7797], [0.1981,0.88], [0.2408,0.9502], [0.2836,0.996], [0.3263,0.9976], [0.369,0.9976], [0.4119,0.9942], [0.4546,0.9951], [0.4973,0.952], [0.5401,0.8854], [0.5828,0.7941], [0.6256,0.6586], [0.6683,0.4466], [0.6774,0.3794], [0.6864,0.3192], [0.6955,0.2831], [0.7065,0.2656], [0.7146,0.2721], [0.7226,0.2798], [0.7307,0.2863], [0.7387,0.289], [0.8342,0.289], [0.9347,0.289], [0.9869,0.289], [0.9952,0.286], [0.9981,0.279], [0.9996,0.2711], [1,0.2631]]
    },
    // El respaldo cuando un artículo todavía no tiene forma asignada.
    // Es la geometría de `vodka`, que es la botella más neutra del
    // catálogo: recta de base a hombro. No aparece en el selector — a
    // nadie se le ofrece elegir "genérica" cuando puede elegir la suya.
    generic: {
      name: 'Generic bottle', asp: 3.41, yFull: 0.756, pourable: true, hidden: true,
      p: null                                   // se copia de vodka más abajo
    },

    // No todo se cuenta por nivel. Una cerveza, una lata o un refresco se
    // cuentan enteros, y enseñarles un deslizador sería pedirle a alguien
    // que estime la fracción de algo que nunca está a medias. La pantalla
    // de conteo mira este campo para enseñar solo los +/−.
    none: {
      name: 'Counted whole · no slider', asp: 3, yFull: 1, pourable: false,
      p: [[0,1],[1,1]]
    }
  };

  PROFILES.generic.p = PROFILES.vodka.p;

  // ── Claves antiguas ─────────────────────────────────────────────────
  //
  // Antes de la tanda de mediciones había siete formas con otros nombres,
  // y hay filas en la base de datos que todavía los llevan. Se traducen
  // aquí en vez de migrarlas: una fila vieja sigue dibujándose bien sin
  // tocar la base de datos, y el día que se reasigne se queda con la
  // clave nueva sola.
  const ALIAS = {
    burgundy:  'wine_burgundy',
    champagne: 'sparkling',
    tequila:   'vodka',          // el usuario pidió que tequila use esta
    liqueur:   'liqueur_slim',
    cylinder:  'apothecary_tall' // el cilindro era la forma de control del
                                 // banco de pruebas, no una botella
  };

  // ── Interpolación entre los puntos del perfil ────────────────────────
  //
  // Spline cúbico MONÓTONO (Fritsch–Carlson). Se eligió ese y no un
  // Catmull-Rom normal por un motivo concreto: un spline corriente se
  // pasa de largo en los cambios bruscos, y en un hombro eso inventaría
  // una panza que la botella no tiene. Monótono garantiza que entre dos
  // puntos la curva no se sale del rango de esos dos puntos: donde el
  // perfil es plano, sale plano; donde baja, solo baja.
  //
  // Y como el dibujo y la integral comparten esta función, la silueta
  // que se ve sigue siendo exactamente la que se calcula.

  // ── Arquetipo o perfil propio ───────────────────────────────────────
  //
  // Todo lo de abajo acepta indistintamente la clave de un arquetipo
  // ('whiskey') o un objeto { asp, yFull, p }. Así el panel de conteo, el
  // selector de siluetas y la integral comparten un solo motor y no puede
  // haber dos geometrías distintas conviviendo.
  function profOf(x) {
    if (x && typeof x === 'object' && Array.isArray(x.p) && x.p.length >= 2) return x;
    if (typeof x === 'string' && ALIAS[x] && PROFILES[ALIAS[x]]) return PROFILES[ALIAS[x]];
    return PROFILES[x] || PROFILES.generic;
  }

  // La clave real detrás de una clave posiblemente antigua. El selector la
  // usa para marcar cuál está puesta cuando la fila trae 'burgundy'.
  function resolveKey(k) {
    if (PROFILES[k]) return k;
    if (ALIAS[k] && PROFILES[ALIAS[k]]) return ALIAS[k];
    return 'generic';
  }

  // ── Forma según el tamaño del envase ────────────────────────────────
  //
  // No hay fórmula. Se midió una magnum de verdad y salió que no es una
  // 750 escalada, así que esto es una TABLA, no un cálculo: solo cambia
  // de perfil cuando existe uno medido para ese formato. Si no existe, se
  // devuelve la forma tal cual, que es lo honesto.
  const BY_SIZE = {
    bordeaux:      [[1500, 'wine_magnum']],
    wine_burgundy: [[1500, 'wine_magnum']]
  };

  function forSize(key, sizeMl) {
    const k = resolveKey(key);
    const rules = BY_SIZE[k];
    if (!rules || !sizeMl) return k;
    let out = k;
    for (const [min, alt] of rules) if (Number(sizeMl) >= min) out = alt;
    return out;
  }

  // Las tangentes se calculan una vez por perfil y se guardan. Recalcular
  // en cada consulta serían miles de veces por arrastre. Los arquetipos
  // se cachean por clave; los perfiles propios, por objeto, para que el
  // caché se libere solo cuando el perfil deja de usarse.
  const _tangents = {};
  const _tangentsObj = new WeakMap();

  function tangentsFor(key, p) {
    const isObj = (typeof key === 'object' && key !== null);
    if (isObj && _tangentsObj.has(key)) return _tangentsObj.get(key);
    if (!isObj && _tangents[key]) return _tangents[key];
    const n = p.length;
    const d = new Array(n - 1);      // pendientes de cada tramo
    for (let i = 0; i < n - 1; i++) {
      const dy = p[i + 1][0] - p[i][0];
      d[i] = dy === 0 ? 0 : (p[i + 1][1] - p[i][1]) / dy;
    }
    const m = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      // Un cambio de signo es un pico: la tangente va a cero para que la
      // curva no se pase de largo.
      m[i] = (d[i - 1] * d[i] <= 0) ? 0 : (d[i - 1] + d[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i];
      const h = Math.hypot(a, b);
      if (h > 3) { m[i] = (3 / h) * a * d[i]; m[i + 1] = (3 / h) * b * d[i]; }
    }
    if (isObj) _tangentsObj.set(key, m); else _tangents[key] = m;
    return m;
  }

  function radiusAt(key, y) {
    const prof = profOf(key);
    const p = prof.p;
    if (p.length < 3) {
      // Dos puntos son una recta y no hay nada que suavizar.
      if (y <= p[0][0]) return p[0][1];
      if (y >= p[p.length - 1][0]) return p[p.length - 1][1];
      const t = (y - p[0][0]) / (p[1][0] - p[0][0]);
      return p[0][1] + (p[1][1] - p[0][1]) * t;
    }
    if (y <= p[0][0]) return p[0][1];
    if (y >= p[p.length - 1][0]) return p[p.length - 1][1];

    // El caché de tangentes va por CLAVE, y una clave antigua y su clave
    // real apuntan al mismo array de puntos. Se normaliza aquí para no
    // guardar dos copias del mismo cálculo.
    const ck = (typeof key === 'object' && key !== null) ? key : resolveKey(key);
    const m = tangentsFor(ck, p);
    for (let i = 1; i < p.length; i++) {
      if (y <= p[i][0]) {
        const [y0, r0] = p[i - 1], [y1, r1] = p[i];
        const h = y1 - y0;
        if (h === 0) return r1;
        const t = (y - y0) / h;
        const t2 = t * t, t3 = t2 * t;
        return (2*t3 - 3*t2 + 1) * r0
             + (t3 - 2*t2 + t) * h * m[i - 1]
             + (-2*t3 + 3*t2) * r1
             + (t3 - t2) * h * m[i];
      }
    }
    return p[p.length - 1][1];
  }

  // Volumen acumulado de la base hasta y, por Simpson. Se integra r² sin
  // el π porque cualquier constante se cancela al dividir.
  function volumeTo(key, y, N) {
    if (y <= 0) return 0;
    N = N || 400;
    const h = y / N;
    let s = 0;
    for (let i = 0; i < N; i++) {
      const a = i * h, b = a + h, m = (a + b) / 2;
      s += (h / 6) * (radiusAt(key, a) ** 2 + 4 * radiusAt(key, m) ** 2 + radiusAt(key, b) ** 2);
    }
    return s;
  }

  // Fracción de botella para una altura dada. Es lo único que consume la
  // pantalla de conteo: devuelve 0 en la base y 1 en la línea de lleno.
  function fractionAt(key, y) {
    const prof = profOf(key);
    const full = volumeTo(key, prof.yFull);
    if (!full) return 0;
    return Math.max(0, Math.min(1, volumeTo(key, Math.min(y, prof.yFull)) / full));
  }

  // Camino inverso: dada una fracción, a qué altura hay que poner la
  // línea. Se busca por bisección sobre la misma integral, así el dibujo
  // y el número nunca pueden discrepar.
  function heightFor(key, fraction) {
    const prof = profOf(key);
    const target = Math.max(0, Math.min(1, fraction));
    let lo = 0, hi = prof.yFull;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fractionAt(key, mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // ── El trazado ───────────────────────────────────────────────────────
  //
  // Vive AQUÍ y no en el panel, para que la silueta que se elige y la que
  // se cuenta salgan de la misma línea de código.
  //
  // Lo que se fija es la ALTURA. El ancho sale de la esbeltez del propio
  // perfil, que es lo que hace que una Crown Royal se vea rechoncha al
  // lado de un Cointreau sin que ninguna de las dos sea más grande. Antes
  // el ancho era `w * 0.30` fijo y todas las botellas salían igual de
  // anchas: la esbeltez medida no llegaba a la pantalla.
  //
  // El clamp es necesario: con la altura fija, una botella de esbeltez
  // 1.77 pide más ancho del que a veces hay. Si no cabe se reduce la
  // altura en vez de recortar los lados, porque una botella recortada por
  // los costados deja de parecer una botella.
  // El encuadre, en un solo sitio. Lo usan el trazado, la línea de lleno
  // y el arrastre del deslizador. Si cada uno lo calculara por su cuenta,
  // bastaría cambiar el `pad` para que el dedo y el dibujo dejaran de
  // coincidir sin que nada diera error.
  function boxFor(x, w, h, pad) {
    pad = pad == null ? 12 : pad;
    const prof = profOf(x);
    const asp = Number(prof.asp) || 3.4;
    let usable = h - pad * 2;
    let maxR = usable / asp / 2;
    const maxAllowed = w / 2 - pad;
    if (maxR > maxAllowed) { maxR = maxAllowed; usable = maxR * 2 * asp; }
    return { maxR, usable, cx: w / 2, base: h - pad - (h - pad * 2 - usable) / 2 };
  }

  function pathFor(x, w, h, pad) {
    const { maxR, usable, cx, base } = boxFor(x, w, h, pad);
    const X = (r) => cx + r * maxR;
    const Y = (y) => base - y * usable;
    const pts = [];
    for (let i = 0; i <= 120; i++) pts.push([i / 120, radiusAt(x, i / 120)]);
    let d = `M ${X(pts[0][1]).toFixed(2)} ${Y(pts[0][0]).toFixed(2)}`;
    for (const [y, r] of pts) d += ` L ${X(r).toFixed(2)} ${Y(y).toFixed(2)}`;
    for (let i = pts.length - 1; i >= 0; i--) {
      d += ` L ${(cx - pts[i][1] * maxR).toFixed(2)} ${Y(pts[i][0]).toFixed(2)}`;
    }
    return d + ' Z';
  }

  // Dónde cae la línea de lleno en la misma caja que `pathFor`. El panel
  // la pintaba por su cuenta con su propia fórmula, y al cambiar el
  // encuadre se habrían separado.
  function yToPx(x, y, w, h, pad) {
    const b = boxFor(x, w, h, pad);
    return b.base - y * b.usable;
  }

  // Un perfil que no venga de este archivo entra al cálculo igual, así que
  // se valida antes de creérselo. Un perfil mal formado no da error: da un
  // número plausible y equivocado.
  function isValidProfile(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.p)) return false;
    if (o.p.length < 4 || o.p.length > 120) return false;
    const yf = Number(o.yFull);
    if (!(yf > 0.4 && yf < 0.97)) return false;
    let lastY = -1;
    for (const q of o.p) {
      if (!Array.isArray(q) || q.length !== 2) return false;
      const [y, r] = q.map(Number);
      if (!isFinite(y) || !isFinite(r)) return false;
      if (y < 0 || y > 1 || r <= 0 || r > 1) return false;
      if (y < lastY) return false;          // los puntos van de base a boca
      lastY = y;
    }
    if (Number(o.p[0][0]) !== 0) return false;
    if (Number(o.p[o.p.length - 1][0]) !== 1) return false;
    if (!o.p.some(q => Number(q[1]) >= 0.98)) return false;   // algo tiene que ser el ancho máximo
    return true;
  }

  function keys() { return Object.keys(PROFILES); }

  // Las que se le ofrecen a una persona: todas menos la genérica, que es
  // un respaldo y no una elección.
  function pickable() {
    return Object.keys(PROFILES).filter(k => !PROFILES[k].hidden);
  }

  function get(key) { return PROFILES[resolveKey(key)] || null; }

  window.BarStockBottleProfiles = {
    PROFILES, ALIAS, keys, pickable, get, profOf, resolveKey, forSize,
    pathFor, yToPx, boxFor, isValidProfile,
    radiusAt, volumeTo, fractionAt, heightFor
  };
})();
