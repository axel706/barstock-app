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
  // Los treinta y tres perfiles de abajo están MEDIDOS. Cada uno se sacó de
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
  // Las excepciones son `clase_azul`, `don_julio_anejo`, `bluecoat` y
  // `botanist`: tapón, cuello largo u hombro brusco, y esa regla deja la
  // línea donde no es. Se ajustaron a ojo de Axel sobre una lámina; su
  // comentario cuenta por qué. Y `carlo_rossi`, `casa_noble`,
  // `monkey_shoulder`, `oban`, `boulard`, `red_label`, `dads_hat`,
  // `balvenie`, `nikka_coffey`, `whistlepig`, `chivas`, `empress`,
  // `disaronno`, `tullamore`, `elijah_craig`, `basil_hayden`, `skrewball`,
  // `dewars`, `bulleit`, `buffalo_trace`, `bols`, `t1800`, `frangelico`,
  // `st_elder`, `st_germain`, `two_gingers`, `averna`, `blade_and_bow`,
  // `campari` y `captain_morgan`, medidas viendo el líquido en la foto. `smirnoff`, `patron`,
  // `belvedere`, `ketel_one`, `jura`, `macallan`, `glenfiddich`,
  // `drambuie`, `fireball`, `cointreau`, `grey_goose`, `ciroc`, `jameson`,
  // `don_julio_blanco`, `michters`, `malibu`, `bacardi`, `v360`, `mozart`
  // `baileys`, `don_julio` y `buchanans` siguen el criterio de
  // `botanist`; `wine_flute` y `blantons` las movió Axel a ojo.
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
    aperol: {
      name: 'Aperol', asp: 4.12, yFull: 0.792, pourable: true,
      // La de Aperol. Medida de una foto de la botella real con fondo
      // transparente: 1000 px de alto por 243 de ancho maximo, el borde
      // leido fila por fila del canal alfa, sin adivinar donde acaba el
      // fondo. Centro estable entre x=491 y x=502. Desajuste de area
      // 0.98 %; lo que mas se separa es la base, por la elipse de
      // perspectiva de la foto, igual que en las demas.
      //
      // Lo que no tiene ninguna otra del catalogo es la CINTURA BAJA: la
      // base se ensancha casi al maximo (.99 al 5 %), se estrecha hasta
      // .86 hacia el 20 % y el cuerpo se va abriendo, sin tramo recto,
      // hasta el hombro estriado (.99 al 57 %). liqueur_slim, la mas
      // parecida en esbeltez (4.27), es recta; la generica, un cilindro.
      //
      // yFull .792 es la altura del 95 % del volumen integrado.
      p: [[0,0.31], [0.0156,0.8165], [0.0469,0.987], [0.0781,0.9741], [0.1094,0.9084], [0.1406,0.8768], [0.1719,0.8645], [0.2031,0.8609], [0.2344,0.8692], [0.2656,0.8819], [0.2969,0.8943], [0.3281,0.9039], [0.3594,0.9161], [0.3906,0.9266], [0.4219,0.9401], [0.4531,0.9522], [0.4844,0.9655], [0.5156,0.9766], [0.5469,0.9873], [0.5781,0.9905], [0.6094,0.9462], [0.6406,0.8037], [0.6719,0.5731], [0.7031,0.4694], [0.7344,0.4476], [0.7656,0.4346], [0.7969,0.4097], [0.8281,0.396], [0.8594,0.3904], [0.8906,0.3868], [0.9219,0.3835], [0.9531,0.3852], [0.9844,0.3684], [1,0.1948]]
    },
    clase_azul: {
      name: 'Clase Azul', asp: 3.97, yFull: 0.75, pourable: true,
      // La de Clase Azul. Medida de una foto con fondo transparente, 538 px
      // de alto por 135 de ancho maximo, fila por fila sobre el canal
      // alfa. Desajuste de area 1.22 %: algo mas que Aperol porque la
      // foto es pequeña y cada pixel de ancho pesa mas.
      //
      // Cinco piezas: base ancha (.99 al 5 %), un cuerpo que se estrecha
      // hacia arriba, una CINTURA encima del pie azul (.54 al 36 %), la
      // panza del medallon (.75 al 48 %), un cuello fino (.38 al 77 %) y
      // el TAPON esferico. La cintura parecia un fallo de medicion —vidrio
      // transparente comido por el corte del canal alfa— y se comprobo
      // que no: mide lo mismo con cualquier umbral.
      //
      // ── yFull NO es el 95 % del volumen ──────────────────────────────
      //
      // Es la unica del catalogo donde esa regla falla. El tapon es
      // macizo y ocupa el 17 % del contorno; y aun midiendo solo hasta el
      // cuello, el tramo de arriba es tan largo y estrecho que el ultimo
      // 5 % del volumen ocupa casi un tercio de la altura. La regla ponia
      // la linea de llena al 66 %, en mitad del cuerpo, y Axel lo vio en
      // la lamina: "dejas el lleno muy abajo". En una Clase Azul llena el
      // tequila llega hasta el tapon, asi que la linea va justo debajo
      // del cuello: .75, donde ya cabe el 99.4 % de lo que hay hasta el.
      p: [[0,0.3556], [0.0156,0.7673], [0.0469,0.9956], [0.0781,0.9834], [0.1094,0.9514], [0.1406,0.9159], [0.1719,0.8702], [0.2031,0.8292], [0.2344,0.7949], [0.2656,0.7617], [0.2969,0.7259], [0.3281,0.6495], [0.3594,0.5429], [0.3906,0.6131], [0.4219,0.7011], [0.4531,0.744], [0.4844,0.7464], [0.5156,0.7229], [0.5469,0.6727], [0.5781,0.6222], [0.6094,0.5821], [0.6406,0.542], [0.6719,0.4986], [0.7031,0.4545], [0.7344,0.4126], [0.7656,0.3829], [0.7969,0.4405], [0.8281,0.5146], [0.8594,0.5847], [0.8906,0.7519], [0.9219,0.756], [0.9531,0.6619], [0.9844,0.4287], [1,0.2123]]
    },
    don_julio_anejo: {
      name: 'Don Julio Añejo', asp: 1.86, yFull: 0.70, pourable: true,
      // La de Don Julio Añejo. Medida de una foto con fondo transparente,
      // 425 px de alto por 228 de ancho maximo, fila por fila sobre el
      // canal alfa. Desajuste de area 1.04 %; solo se separa la base, por
      // la perspectiva (las dos ultimas filas se van de centro).
      //
      // Casi igual de ancha que crown (1.86 contra 1.77) y, como ella, se
      // estrecha hacia la base. Lo que la separa: un hombro CORTO y casi
      // plano (de .97 a .35 entre el 58 % y el 67 %), un cuello recto con
      // la banda de "Añejo Tequila" y un tapon de madera mas ancho que el
      // cuello. En crown el hombro es largo y el cuello sale sin escalon.
      //
      // ── yFull NO es el 95 % del volumen ──────────────────────────────
      //
      // Como en clase_azul. La regla la ponia al 63 %, en mitad del
      // hombro. El primer intento la subio justo debajo de la madera
      // (79 %) y Axel lo vio en la lamina: "te estas yendo al tapon". El
      // aro oscuro del tapon mide lo mismo que el cuello y un corte por
      // ancho no lo distingue. El corcho entra por el cuello, asi que la
      // linea va donde termina el hombro y empieza el cuello: .70, donde
      // ya cabe el 98 % de lo que hay hasta el tapon.
      p: [[0,0.4971], [0.0156,0.8117], [0.0469,0.9177], [0.0781,0.9258], [0.1094,0.9352], [0.1406,0.9433], [0.1719,0.9501], [0.2031,0.9561], [0.2344,0.9605], [0.2656,0.9633], [0.2969,0.9693], [0.3281,0.974], [0.3594,0.9781], [0.3906,0.9825], [0.4219,0.9868], [0.4531,0.9926], [0.4844,0.9956], [0.5156,0.9991], [0.5469,0.9949], [0.5781,0.9676], [0.6094,0.8762], [0.6406,0.6093], [0.6719,0.3451], [0.7031,0.3266], [0.7344,0.3246], [0.7656,0.3236], [0.7969,0.3229], [0.8281,0.4207], [0.8594,0.4437], [0.8906,0.4248], [0.9219,0.4426], [0.9531,0.416], [0.9844,0.2908], [1,0.1564]]
    },
    bluecoat: {
      name: 'Bluecoat', asp: 3.44, yFull: 0.73, pourable: true,
      // La de Bluecoat. Medida de una foto con fondo transparente, 426 px
      // de alto por 124 de ancho maximo, fila por fila sobre el canal
      // alfa, centro estable (x 60-63). Desajuste de area 0.72 %, de los
      // mas bajos; lo que mas se separa es el hombro.
      //
      // Casi la misma esbeltez que vodka (3.44 contra 3.41), pero no es
      // la misma botella: se ESTRECHA hacia la base (.90 abajo, 1 en el
      // hombro), el hombro es cuadrado y corto (de .99 a .37 entre el 65 %
      // y el 75 %) y el cuello es largo y se afina hacia el corcho.
      //
      // ── yFull NO es el 95 % del volumen ──────────────────────────────
      //
      // La regla la ponia al 71 %. Con el criterio de don_julio_anejo
      // (donde termina el hombro y empieza el cuello) quedaba al 75 %, y
      // Axel la vio "un poco, solo un poco" alta: .73, en lo alto del
      // hombro.
      p: [[0,0.8763], [0.0156,0.9147], [0.0469,0.9107], [0.0781,0.9032], [0.1094,0.9032], [0.1406,0.9088], [0.1719,0.8976], [0.2031,0.9032], [0.2344,0.9078], [0.2656,0.9113], [0.2969,0.9237], [0.3281,0.9274], [0.3594,0.9305], [0.3906,0.9392], [0.4219,0.946], [0.4531,0.9516], [0.4844,0.9622], [0.5156,0.969], [0.5469,0.977], [0.5781,0.9882], [0.6094,0.9919], [0.6406,0.9957], [0.6719,0.9631], [0.7031,0.7177], [0.7344,0.4237], [0.7656,0.3514], [0.7969,0.3368], [0.8281,0.3189], [0.8594,0.299], [0.8906,0.2823], [0.9219,0.3089], [0.9531,0.3226], [0.9844,0.322], [1,0.2608]]
    },
    botanist: {
      name: 'The Botanist', asp: 3.1, yFull: 0.69, pourable: true,
      // La de The Botanist. Medida de una foto con fondo transparente,
      // 385 px de alto por 124 de ancho maximo, fila por fila sobre el
      // canal alfa. Desajuste de area 0.95 %; solo se separan las cuatro
      // filas de la base, por la sombra.
      //
      // Cilindro recto del 5 % al 66 % y un hombro MUY corto: del cuerpo
      // al cuello en ~6 % de la altura (de .99 a .36 entre el 66 % y el
      // 73 %). Vodka tiene un hombro largo en pendiente y whiskey, que es
      // igual de ancha (3.05), lleva collares en la base y el hombro.
      //
      // ── yFull NO es el 95 % del volumen ──────────────────────────────
      //
      // Aqui la regla se pasaba por ARRIBA: 75 %, ya dentro del cuello.
      // Se ajusto sobre la lamina con Axel: 71 % "muy arriba", 67 % le
      // faltaba "que cubra los hombros", .69 si.
      p: [[0,0.4624], [0.0156,0.8192], [0.0469,0.9899], [0.0781,0.9758], [0.1094,0.9805], [0.1406,0.9825], [0.1719,0.9758], [0.2031,0.9819], [0.2344,0.9839], [0.2656,0.9839], [0.2969,0.9839], [0.3281,0.9886], [0.3594,0.9919], [0.3906,0.9866], [0.4219,0.9839], [0.4531,0.9839], [0.4844,0.9839], [0.5156,0.9852], [0.5469,0.9919], [0.5781,0.9919], [0.6094,0.9919], [0.6406,0.9926], [0.6719,0.9805], [0.7031,0.5155], [0.7344,0.3495], [0.7656,0.3448], [0.7969,0.371], [0.8281,0.371], [0.8594,0.371], [0.8906,0.373], [0.9219,0.3952], [0.9531,0.3878], [0.9844,0.3837], [1,0.3522]]
    },
    carlo_rossi: {
      name: 'Carlo Rossi', asp: 1.95, yFull: 0.79, pourable: true,
      // El garrafon de Carlo Rossi, y la primera con ASA. Medida de una
      // foto con fondo transparente (453 px de alto), pero SOLO la mitad
      // izquierda —del borde al eje, x=117.4— reflejada: el asa va a la
      // derecha y, medida de borde a borde, habria inflado el ancho y el
      // volumen. Desajuste de area 0.67 %.
      //
      // Cuerpo recto y ancho, hombro redondo y largo, cuello que se afina
      // hacia la tapa. Ancha como crown (1.95 contra 1.77).
      //
      // ── yFull esta MEDIDA ────────────────────────────────────────────
      //
      // La primera del catalogo en la que se ve el liquido: el vino es
      // rojo oscuro y el vidrio vacio del cuello, claro. Por la columna
      // del centro el cambio cae entre el 78 % y el 80 % de la altura.
      //
      // ── El asa ───────────────────────────────────────────────────────
      //
      // Las siluetas son de revolucion: un radio por altura, reflejado,
      // y asi se integra el volumen. Un asa no cabe en eso, asi que va
      // aparte: `borde` es su lado de fuera y `interior` el borde del
      // hueco, en las mismas unidades que `p` (y de 0 a 1, r relativo al
      // ancho maximo, siempre a la derecha). La traza `asaFor`; no entra
      // en `radiusAt` ni en el volumen. En la foto el asa esta vacia
      // —vidrio claro, sin vino— y se dibuja asi, sin liquido.
      asa: {
        borde:    [[0.896,0.426], [0.8827,0.572], [0.8673,0.632], [0.854,0.658], [0.8385,0.667], [0.8252,0.675], [0.8097,0.675], [0.7965,0.675], [0.781,0.675], [0.7677,0.667], [0.7522,0.658], [0.7389,0.649], [0.7235,0.632], [0.7102,0.615]],
        interior: [[0.854,0.486], [0.8407,0.529], [0.8252,0.538], [0.8119,0.546], [0.7965,0.546], [0.7832,0.538], [0.7699,0.521], [0.7544,0.495], [0.7412,0.435]]
      },
      p: [[0,0.3728], [0.0156,0.6581], [0.0469,0.8496], [0.0781,0.9116], [0.1094,0.9497], [0.1406,0.9669], [0.1719,0.9742], [0.2031,0.9742], [0.2344,0.9742], [0.2656,0.9742], [0.2969,0.9742], [0.3281,0.9742], [0.3594,0.9797], [0.3906,0.9828], [0.4219,0.9896], [0.4531,0.9914], [0.4844,0.9914], [0.5156,0.9937], [0.5469,1], [0.5781,0.9963], [0.6094,0.9662], [0.6406,0.9073], [0.6719,0.8048], [0.7031,0.6306], [0.7344,0.4268], [0.7656,0.339], [0.7969,0.309], [0.8281,0.285], [0.8594,0.2574], [0.8906,0.2353], [0.9219,0.2298], [0.9531,0.2261], [0.9844,0.2145], [1,0.138]]
    },
    smirnoff: {
      name: 'Smirnoff', asp: 3.93, yFull: 0.75, pourable: true,
      // La de Smirnoff (la foto era la de vainilla; los sabores comparten
      // botella). Medida de una foto con fondo transparente, 554 px de
      // alto por 141 de ancho maximo, fila por fila sobre el canal alfa,
      // centro estable. Desajuste de area 0.66 %.
      //
      // Caia en la de vodka, que es recta y de hombro largo. Esta tiene
      // la base ensanchada, una cintura suave hacia el 15 %, un cuerpo que
      // se abre hasta un hombro CORTO al 70 % (de .99 a .45 en el 8 % de
      // la altura) y un cuello recto. La mas parecida es aperol, que tiene
      // el cuello mas largo y el hombro mas arriba.
      //
      // yFull .75: a media bajada del hombro, el criterio que Axel fijo
      // con botanist ("que cubra los hombros"). La regla del 95 % daba .77.
      p: [[0,0.6028], [0.0156,0.8467], [0.0469,0.99], [0.0781,0.9967], [0.1094,0.9196], [0.1406,0.9024], [0.1719,0.9078], [0.2031,0.9128], [0.2344,0.9216], [0.2656,0.9212], [0.2969,0.9303], [0.3281,0.9381], [0.3594,0.9433], [0.3906,0.9458], [0.4219,0.9537], [0.4531,0.9574], [0.4844,0.9654], [0.5156,0.9716], [0.5469,0.9716], [0.5781,0.9716], [0.6094,0.975], [0.6406,0.9921], [0.6719,0.9929], [0.7031,0.995], [0.7344,0.806], [0.7656,0.5457], [0.7969,0.3938], [0.8281,0.3901], [0.8594,0.3901], [0.8906,0.3885], [0.9219,0.3922], [0.9531,0.3963], [0.9844,0.3821], [1,0.3475]]
    },
    patron: {
      name: 'Patrón', asp: 1.72, yFull: 0.56, pourable: true,
      // La de Patron (Silver, Reposado y Añejo comparten botella). Medida
      // de una foto con fondo transparente, 445 px de alto por 259 de
      // ancho maximo, fila por fila sobre el canal alfa. Desajuste de area
      // 1.05 %; solo se van de centro las tres filas de la base, la sombra.
      //
      // La segunda mas ancha (1.72; solo globe_footed la pasa). Cuerpo casi
      // recto y una CUPULA de hombro larga, del 35 % al 60 % de la altura,
      // que ninguna otra tiene: crown baja en pendiente con un cuello alto,
      // don_julio_anejo tiene el hombro casi plano. Cuello corto con la
      // banda verde y corcho en bola.
      //
      // yFull .56: cubre la cupula casi hasta el cuello. La regla del 95 %
      // la ponia al .77, debajo del corcho, el mismo fallo que en
      // clase_azul y don_julio_anejo.
      p: [[0,0.4994], [0.0156,0.824], [0.0469,0.9746], [0.0781,0.9931], [0.1094,0.9848], [0.1406,0.9945], [0.1719,0.9694], [0.2031,0.9708], [0.2344,0.9688], [0.2656,0.9509], [0.2969,0.9548], [0.3281,0.9404], [0.3594,0.9266], [0.3906,0.9197], [0.4219,0.8977], [0.4531,0.8682], [0.4844,0.8209], [0.5156,0.749], [0.5469,0.6362], [0.5781,0.4757], [0.6094,0.3398], [0.6406,0.3045], [0.6719,0.3001], [0.7031,0.2951], [0.7344,0.2902], [0.7656,0.2832], [0.7969,0.3362], [0.8281,0.4049], [0.8594,0.3439], [0.8906,0.3646], [0.9219,0.3616], [0.9531,0.326], [0.9844,0.2278], [1,0.112]]
    },
    wine_flute: {
      name: 'Wine · Flute', asp: 4.33, yFull: 0.70, pourable: true,
      // La flauta: Riesling, Gewurztraminer y los vinos que vienen en ella.
      // Medida de una foto de un J. Lohr Bay Mist White Riesling, fondo
      // transparente, 554 px de alto por 128 de ancho maximo, centro
      // constante. Desajuste de area 0.77 %.
      //
      // La mas esbelta del catalogo (4.33, por delante de liqueur_slim).
      // Cuerpo recto hasta la mitad y un hombro MUY largo, del 45 % al
      // 80 % de la altura, que se funde con el cuello sin escalon. Iba en
      // wine_burgundy, que es mas ancha y cuyo hombro empieza mas arriba:
      // con la misma cantidad, el nivel se ve distinto.
      //
      // yFull .70, a media bajada del hombro. La regla del 95 % daba .77;
      // Axel la bajo sobre la lamina: .77, .74 y "yo diria 70".
      p: [[0,0.3906], [0.0156,0.809], [0.0469,0.9844], [0.0781,0.9931], [0.1094,0.9952], [0.1406,0.9922], [0.1719,0.9922], [0.2031,0.9922], [0.2344,0.9822], [0.2656,0.9775], [0.2969,0.9775], [0.3281,0.9779], [0.3594,0.9775], [0.3906,0.971], [0.4219,0.9674], [0.4531,0.9492], [0.4844,0.9127], [0.5156,0.8727], [0.5469,0.8225], [0.5781,0.756], [0.6094,0.6769], [0.6406,0.6131], [0.6719,0.5534], [0.7031,0.4954], [0.7344,0.4494], [0.7656,0.411], [0.7969,0.3764], [0.8281,0.3608], [0.8594,0.3594], [0.8906,0.3611], [0.9219,0.3663], [0.9531,0.3631], [0.9844,0.341], [1,0.2708]]
    },
    belvedere: {
      name: 'Belvedere', asp: 4.81, yFull: 0.68, pourable: true,
      // La de Belvedere. Medida de una foto con fondo transparente, 447 px
      // de alto por 93 de ancho maximo, centro constante. Desajuste de area
      // 0.44 %. Foto pequeña: cada pixel de ancho pesa mas del 1 %.
      //
      // La mas esbelta del catalogo (4.81). Iba en la de vodka (3.41), que
      // es bastante mas ancha. Cilindro recto hasta el 63 %, hombro corto
      // hasta el 72 % y un cuello recto y largo. Parecida a ketel_one, que
      // tiene el hombro mas arriba y el cuello mas corto: Axel, "similares
      // pero no iguales".
      //
      // yFull .68, a media bajada del hombro (el criterio de botanist).
      p: [[0,0.767], [0.0156,0.9255], [0.0469,0.9892], [0.0781,0.9892], [0.1094,0.9892], [0.1406,0.9892], [0.1719,0.9892], [0.2031,0.9892], [0.2344,0.9892], [0.2656,0.9892], [0.2969,0.9892], [0.3281,0.9892], [0.3594,0.9892], [0.3906,0.9892], [0.4219,0.9892], [0.4531,0.9923], [0.4844,1], [0.5156,1], [0.5469,1], [0.5781,0.9969], [0.6094,0.9962], [0.6406,0.9439], [0.6719,0.7834], [0.7031,0.5046], [0.7344,0.4094], [0.7656,0.4194], [0.7969,0.4194], [0.8281,0.4147], [0.8594,0.4009], [0.8906,0.3978], [0.9219,0.3986], [0.9531,0.4378], [0.9844,0.4359], [1,0.4014]]
    },
    ketel_one: {
      name: 'Ketel One', asp: 4.63, yFull: 0.75, pourable: true,
      // La de Ketel One. Medida de una foto con fondo transparente, 384 px
      // de alto por 83 de ancho maximo; solo las dos filas de la base se
      // van de centro. Desajuste de area 0.92 %. Foto pequeña, como la de
      // belvedere.
      //
      // Recta hasta el 71 %, con un surco pequeño cerca de la base, hombro
      // hasta el 79 % y cuello recto. Respecto a belvedere: el hombro mas
      // alto y el cuello mas corto.
      //
      // yFull .75, a media bajada del hombro.
      p: [[0,0.4337], [0.0156,0.7892], [0.0469,0.999], [0.0781,1], [0.1094,0.99], [0.1406,0.9558], [0.1719,0.9649], [0.2031,0.988], [0.2344,0.988], [0.2656,0.988], [0.2969,0.993], [0.3281,1], [0.3594,1], [0.3906,1], [0.4219,1], [0.4531,1], [0.4844,1], [0.5156,1], [0.5469,1], [0.5781,0.9789], [0.6094,0.9859], [0.6406,0.9679], [0.6719,0.9759], [0.7031,0.9398], [0.7344,0.7992], [0.7656,0.509], [0.7969,0.4137], [0.8281,0.4016], [0.8594,0.4006], [0.8906,0.3976], [0.9219,0.3956], [0.9531,0.3976], [0.9844,0.3834], [1,0.3012]]
    },
    blantons: {
      name: "Blanton's", asp: 1.98, yFull: 0.59, pourable: true,
      // La de Blanton's: granada ancha, cupula de hombro larga, cuello corto
      // y el caballito del tapon. Medida de una foto con fondo transparente,
      // 530 px de alto por 269 de ancho maximo. Desajuste de area 1.63 %:
      // el caballito no es simetrico y la silueta, que es de revolucion, lo
      // dibuja como un tapon con relieve; lo que mas se separa es arriba.
      //
      // yFull .59: cubre la cupula hasta el cuello. Se propuso .56 (el
      // criterio de patron) y Axel la quiso "un poco mas llena".
      p: [[0,0.3483], [0.0156,0.5818], [0.0469,0.739], [0.0781,0.8074], [0.1094,0.8717], [0.1406,0.9297], [0.1719,0.9813], [0.2031,0.9971], [0.2344,1], [0.2656,1], [0.2969,1], [0.3281,1], [0.3594,1], [0.3906,0.9978], [0.4219,0.9951], [0.4531,0.9647], [0.4844,0.8958], [0.5156,0.8196], [0.5469,0.7282], [0.5781,0.579], [0.6094,0.3322], [0.6406,0.31], [0.6719,0.3109], [0.7031,0.3109], [0.7344,0.3134], [0.7656,0.4098], [0.7969,0.4562], [0.8281,0.4391], [0.8594,0.3474], [0.8906,0.3547], [0.9219,0.2502], [0.9531,0.2963], [0.9844,0.1971], [1,0.0462]]
    },
    jura: {
      name: 'Jura', asp: 2.87, yFull: 0.68, pourable: true,
      // La de Jura. La foto traia el tubo de carton a la izquierda; se midio
      // solo la botella (x >= 195), 508 px de alto por 177 de ancho, centro
      // constante. Desajuste de area 0.71 %.
      //
      // Cuerpo con una cintura suave entre la base y el hombro, hombro corto
      // del 65 % al 75 % y cuello recto. yFull .68, a media bajada.
      p: [[0,0.4953], [0.0156,0.7592], [0.0469,0.923], [0.0781,0.9735], [0.1094,0.9961], [0.1406,0.9968], [0.1719,0.9901], [0.2031,0.9751], [0.2344,0.9523], [0.2656,0.929], [0.2969,0.91], [0.3281,0.8965], [0.3594,0.8927], [0.3906,0.8927], [0.4219,0.8987], [0.4531,0.9181], [0.4844,0.9389], [0.5156,0.9647], [0.5469,0.9869], [0.5781,0.9944], [0.6094,0.9876], [0.6406,0.9421], [0.6719,0.81], [0.7031,0.5516], [0.7344,0.4615], [0.7656,0.4477], [0.7969,0.4147], [0.8281,0.3715], [0.8594,0.3482], [0.8906,0.339], [0.9219,0.3552], [0.9531,0.3616], [0.9844,0.3469], [1,0.2448]]
    },
    macallan: {
      name: 'Macallan', asp: 3.87, yFull: 0.75, pourable: true,
      // La de Macallan; Axel: "todos los Macallan son iguales". Medida de
      // una foto DIMINUTA (la edicion David Carson), 182 px de alto por 47
      // de ancho: cada pixel de ancho pesa mas del 2 %. Desajuste de area
      // 1.20 %. Si llega una foto mas grande, se vuelve a medir.
      //
      // Recta y alta, hombro corto del 72 % al 80 % y cuello recto. yFull
      // .75, a media bajada del hombro.
      p: [[0,0.383], [0.0156,0.5709], [0.0469,0.8298], [0.0781,0.8298], [0.1094,0.8298], [0.1406,0.8298], [0.1719,0.8426], [0.2031,0.8511], [0.2344,0.8723], [0.2656,0.8723], [0.2969,0.8865], [0.3281,0.8936], [0.3594,0.8936], [0.3906,0.8936], [0.4219,0.9149], [0.4531,0.9362], [0.4844,0.9362], [0.5156,0.9362], [0.5469,0.9617], [0.5781,0.9787], [0.6094,0.9787], [0.6406,0.9787], [0.6719,0.9965], [0.7031,0.9645], [0.7344,0.8], [0.7656,0.5213], [0.7969,0.3901], [0.8281,0.383], [0.8594,0.3723], [0.8906,0.3617], [0.9219,0.3617], [0.9531,0.3617], [0.9844,0.3574], [1,0.2695]]
    },
    glenfiddich: {
      name: 'Glenfiddich', asp: 3.93, yFull: 0.75, pourable: true,
      // La de Glenfiddich 12. Medida de una foto con fondo transparente,
      // 1162 px de alto por 296 de ancho maximo. Desajuste de area 0.73 %;
      // lo que mas se separa es la base redondeada.
      //
      // La botella real es de tres caras; la silueta, de revolucion, la
      // trata como redonda. Lo que se pierde ahi es una constante que no
      // cambia el nivel relativo. Alta y recta, hombro corto del 64 % al
      // 77 % y cuello recto. yFull .75: cubre el hombro.
      p: [[0,0.1622], [0.0156,0.7267], [0.0469,0.9886], [0.0781,0.9686], [0.1094,0.93], [0.1406,0.9299], [0.1719,0.9324], [0.2031,0.936], [0.2344,0.9392], [0.2656,0.9425], [0.2969,0.9447], [0.3281,0.9485], [0.3594,0.9522], [0.3906,0.9546], [0.4219,0.9605], [0.4531,0.9637], [0.4844,0.9673], [0.5156,0.9731], [0.5469,0.9789], [0.5781,0.9845], [0.6094,0.9892], [0.6406,0.9905], [0.6719,0.9421], [0.7031,0.7296], [0.7344,0.5135], [0.7656,0.4541], [0.7969,0.4626], [0.8281,0.4462], [0.8594,0.4236], [0.8906,0.4142], [0.9219,0.4339], [0.9531,0.4314], [0.9844,0.4197], [1,0.3412]]
    },
    casa_noble: {
      name: 'Casa Noble', asp: 4.1, yFull: 0.73, pourable: true,
      // La de Casa Noble (foto del Reposado). 1940 px de alto por 473 de
      // ancho maximo, desajuste de area 0.55 %. Hombros biselados, cuello
      // angosto y la bola del tapon.
      //
      // yFull .73 no es a ojo: es donde empieza el liquido naranja en la
      // foto, fila por fila, justo donde terminan los hombros. Por la
      // categoria caia en la de vodka, que tiene el hombro mas alto.
      p: [[0,0.828], [0.0156,0.8789], [0.0469,0.9148], [0.0781,0.9447], [0.1094,0.9703], [0.1406,0.9746], [0.1719,0.9762], [0.2031,0.9789], [0.2344,0.9792], [0.2656,0.9823], [0.2969,0.9831], [0.3281,0.9845], [0.3594,0.9869], [0.3906,0.9875], [0.4219,0.9905], [0.4531,0.9915], [0.4844,0.9938], [0.5156,0.9958], [0.5469,0.9965], [0.5781,0.9995], [0.6094,1], [0.6406,0.9884], [0.6719,0.9424], [0.7031,0.807], [0.7344,0.4777], [0.7656,0.4017], [0.7969,0.4017], [0.8281,0.4017], [0.8594,0.4116], [0.8906,0.5185], [0.9219,0.5354], [0.9531,0.5203], [0.9844,0.3283], [1,0.0747]]
    },
    drambuie: {
      name: 'Drambuie', asp: 2.44, yFull: 0.72, pourable: true,
      // La de Drambuie. 500 px de alto por 205 de ancho maximo, desajuste
      // de area 0.46 %. Baja y ancha, hombro largo y redondo del 58 % al
      // 73 %, cuello con la capsula. Por la categoria caia en liqueur_slim,
      // que es esbelta: la mitad de ancha para la misma altura. yFull
      // .72: cubre el hombro.
      p: [[0,0.7935], [0.0156,0.8405], [0.0469,0.8872], [0.0781,0.9011], [0.1094,0.9122], [0.1406,0.9213], [0.1719,0.9296], [0.2031,0.9387], [0.2344,0.9447], [0.2656,0.9518], [0.2969,0.9607], [0.3281,0.9662], [0.3594,0.9716], [0.3906,0.9798], [0.4219,0.9826], [0.4531,0.9902], [0.4844,0.9902], [0.5156,0.9951], [0.5469,1], [0.5781,0.9936], [0.6094,0.945], [0.6406,0.8439], [0.6719,0.6793], [0.7031,0.4667], [0.7344,0.3756], [0.7656,0.3629], [0.7969,0.3503], [0.8281,0.3393], [0.8594,0.347], [0.8906,0.3561], [0.9219,0.3828], [0.9531,0.428], [0.9844,0.415], [1,0.348]]
    },
    fireball: {
      name: 'Fireball', asp: 3.06, yFull: 0.75, pourable: true,
      // La de Fireball. Medida de una foto con fondo transparente, 521 px
      // de alto por 170 de ancho maximo. Desajuste de area 0.71 %. La foto
      // parece la botella de plastico; si la de 750 ml de vidrio resulta
      // ser otra, la regla por nombre se acota a la que es.
      //
      // Recta de base a hombro, hombro del 64 % al 77 %, cuello largo. En
      // la foto el liquido sube casi hasta la tapa, pero la etiqueta del
      // cuello tapa donde acaba: yFull .75 sigue el criterio de botanist,
      // que cubra el hombro.
      p: [[0,0.3961], [0.0156,0.7938], [0.0469,0.9776], [0.0781,0.993], [0.1094,0.9941], [0.1406,0.9941], [0.1719,0.9941], [0.2031,0.9941], [0.2344,0.9956], [0.2656,1], [0.2969,1], [0.3281,1], [0.3594,1], [0.3906,1], [0.4219,1], [0.4531,1], [0.4844,1], [0.5156,1], [0.5469,1], [0.5781,1], [0.6094,1], [0.6406,0.9958], [0.6719,0.9419], [0.7031,0.8114], [0.7344,0.5632], [0.7656,0.399], [0.7969,0.3621], [0.8281,0.354], [0.8594,0.3529], [0.8906,0.3429], [0.9219,0.3312], [0.9531,0.3239], [0.9844,0.3151], [1,0.2765]]
    },
    monkey_shoulder: {
      name: 'Monkey Shoulder', asp: 2.56, yFull: 0.65, pourable: true,
      // La de Monkey Shoulder. 1082 px de alto por 422 de ancho maximo,
      // desajuste de area 0.85 %. Medida con la mitad IZQUIERDA reflejada:
      // los monos de metal van en el hombro derecho y podian ensanchar la
      // silueta. Al final apenas la cambian (0.83 % con las dos mitades).
      //
      // Baja y ancha, hombro del 52 % al 66 %. yFull .65 medida viendo el
      // liquido en la foto: empieza al 64 %, encima hay vidrio vacio y la
      // capsula gris.
      p: [[0,0.1643], [0.0156,0.7979], [0.0469,0.9996], [0.0781,0.9898], [0.1094,0.9858], [0.1406,0.9858], [0.1719,0.9858], [0.2031,0.9858], [0.2344,0.9858], [0.2656,0.9858], [0.2969,0.9858], [0.3281,0.9858], [0.3594,0.9858], [0.3906,0.9858], [0.4219,0.9836], [0.4531,0.9837], [0.4844,1], [0.5156,0.9919], [0.5469,0.9455], [0.5781,0.8578], [0.6094,0.706], [0.6406,0.4474], [0.6719,0.356], [0.7031,0.3577], [0.7344,0.3791], [0.7656,0.3791], [0.7969,0.3791], [0.8281,0.3739], [0.8594,0.3421], [0.8906,0.3606], [0.9219,0.3649], [0.9531,0.3649], [0.9844,0.3544], [1,0.2622]]
    },
    oban: {
      name: 'Oban', asp: 3.95, yFull: 0.71, pourable: true,
      // La de Oban (foto del 14). 1162 px de alto por 294 de ancho maximo,
      // desajuste de area 0.76 %. Alta, hombro corto del 57 % al 67 % y
      // cuello largo. yFull .71 medida viendo el liquido en la foto: ya
      // dentro del cuello.
      p: [[0,0.3322], [0.0156,0.7867], [0.0469,0.9356], [0.0781,0.9382], [0.1094,0.942], [0.1406,0.9451], [0.1719,0.9495], [0.2031,0.9524], [0.2344,0.9548], [0.2656,0.9592], [0.2969,0.9643], [0.3281,0.9685], [0.3594,0.9728], [0.3906,0.9755], [0.4219,0.9796], [0.4531,0.9827], [0.4844,0.9874], [0.5156,0.9929], [0.5469,0.998], [0.5781,0.9828], [0.6094,0.8898], [0.6406,0.6767], [0.6719,0.4757], [0.7031,0.4387], [0.7344,0.4351], [0.7656,0.4327], [0.7969,0.4219], [0.8281,0.3875], [0.8594,0.366], [0.8906,0.3461], [0.9219,0.3593], [0.9531,0.3612], [0.9844,0.3624], [1,0.2551]]
    },
    boulard: {
      name: 'Boulard', asp: 3.71, yFull: 0.73, pourable: true,
      // La de Boulard VSOP. 1038 px de alto por 280 de ancho maximo,
      // desajuste de area 0.98 %. Hombro bajo, del 44 % al 58 %, y un
      // cuello muy largo. yFull .73 medida viendo el liquido en la foto:
      // llega bien arriba del cuello, que es estrecho y pesa poco en el
      // volumen.
      p: [[0,0.3536], [0.0156,0.7273], [0.0469,0.8866], [0.0781,0.8957], [0.1094,0.9056], [0.1406,0.9144], [0.1719,0.9262], [0.2031,0.9362], [0.2344,0.945], [0.2656,0.9549], [0.2969,0.965], [0.3281,0.9756], [0.3594,0.9868], [0.3906,0.9959], [0.4219,1], [0.4531,0.985], [0.4844,0.8843], [0.5156,0.6271], [0.5469,0.5029], [0.5781,0.442], [0.6094,0.4042], [0.6406,0.3845], [0.6719,0.3642], [0.7031,0.3404], [0.7344,0.3357], [0.7656,0.3281], [0.7969,0.3154], [0.8281,0.3083], [0.8594,0.3073], [0.8906,0.3421], [0.9219,0.3698], [0.9531,0.3435], [0.9844,0.3068], [1,0.1631]]
    },
    red_label: {
      name: "Red Label", asp: 3.99, yFull: 0.76, pourable: true,
      // La de Johnnie Walker Red Label. 543 px de alto por 136 de ancho
      // maximo, desajuste de area 0.45 %. La botella real es cuadrada; la
      // silueta, de revolucion, la trata como redonda, que es una
      // constante y no cambia el nivel relativo. Recta, hombro del 70 % al
      // 83 %, cuello corto. yFull .76 medida viendo el liquido en la foto,
      // a mitad del hombro: encima, cuello vacio y la tapa dorada.
      p: [[0,0.8015], [0.0156,0.9416], [0.0469,0.9987], [0.0781,1], [0.1094,1], [0.1406,1], [0.1719,1], [0.2031,1], [0.2344,1], [0.2656,1], [0.2969,1], [0.3281,1], [0.3594,1], [0.3906,1], [0.4219,1], [0.4531,1], [0.4844,1], [0.5156,1], [0.5469,1], [0.5781,1], [0.6094,1], [0.6406,1], [0.6719,1], [0.7031,0.9516], [0.7344,0.7971], [0.7656,0.6116], [0.7969,0.471], [0.8281,0.3936], [0.8594,0.3663], [0.8906,0.404], [0.9219,0.4079], [0.9531,0.4005], [0.9844,0.369], [1,0.1838]]
    },
    dads_hat: {
      name: "Dad's Hat", asp: 3.18, yFull: 0.72, pourable: true,
      // La de Dad's Hat. 670 px de alto por 211 de ancho maximo, desajuste
      // de area 0.58 %. Recta, hombro corto del 64 % al 73 %, cuello recto.
      // yFull .72 medida viendo el liquido en la foto, justo arriba del
      // hombro.
      p: [[0,0.5513], [0.0156,0.8775], [0.0469,0.9941], [0.0781,0.9932], [0.1094,0.9953], [0.1406,0.9953], [0.1719,0.9986], [0.2031,0.9989], [0.2344,0.9998], [0.2656,1], [0.2969,1], [0.3281,1], [0.3594,1], [0.3906,1], [0.4219,1], [0.4531,1], [0.4844,1], [0.5156,1], [0.5469,0.9968], [0.5781,0.9953], [0.6094,0.9935], [0.6406,0.9562], [0.6719,0.8559], [0.7031,0.6427], [0.7344,0.3963], [0.7656,0.3791], [0.7969,0.3791], [0.8281,0.3791], [0.8594,0.3782], [0.8906,0.3956], [0.9219,0.4076], [0.9531,0.4076], [0.9844,0.4059], [1,0.3744]]
    },
    cointreau: {
      name: "Cointreau", asp: 2.43, yFull: 0.72, pourable: true,
      // La de Cointreau (foto del litro). 990 px de alto por 408 de ancho
      // maximo, desajuste de area 0.76 %. Botella cuadrada, tratada como
      // redonda igual que Red Label. Baja y ancha, hombro del 58 % al 73 %.
      // Con el vidrio naranja y la tapa cobre el liquido no se distingue:
      // yFull .72 sigue el criterio de botanist, que cubra el hombro.
      p: [[0,0.2761], [0.0156,0.7793], [0.0469,0.9812], [0.0781,0.9995], [0.1094,1], [0.1406,0.9986], [0.1719,0.9951], [0.2031,0.9951], [0.2344,0.9951], [0.2656,0.9951], [0.2969,0.9949], [0.3281,0.9905], [0.3594,0.9945], [0.3906,0.9951], [0.4219,0.9951], [0.4531,0.9983], [0.4844,1], [0.5156,0.9973], [0.5469,0.9867], [0.5781,0.9774], [0.6094,0.9469], [0.6406,0.8748], [0.6719,0.7435], [0.7031,0.476], [0.7344,0.3511], [0.7656,0.3306], [0.7969,0.3183], [0.8281,0.3137], [0.8594,0.3109], [0.8906,0.3137], [0.9219,0.314], [0.9531,0.314], [0.9844,0.3065], [1,0.2386]]
    },
    balvenie: {
      name: "Balvenie", asp: 2.98, yFull: 0.72, pourable: true,
      // La de Balvenie (foto del DoubleWood 12). 978 px de alto por 328 de
      // ancho maximo, desajuste de area 0.90 %. Hombro del 56 % al 67 % y
      // cuello con un anillo. yFull .72 medida viendo el liquido en la
      // foto, debajo de la franja de vidrio vacio.
      p: [[0,0.2419], [0.0156,0.7696], [0.0469,0.997], [0.0781,0.9603], [0.1094,0.9374], [0.1406,0.9488], [0.1719,0.9512], [0.2031,0.9512], [0.2344,0.9565], [0.2656,0.963], [0.2969,0.9648], [0.3281,0.9748], [0.3594,0.9784], [0.3906,0.983], [0.4219,0.9878], [0.4531,0.988], [0.4844,0.9939], [0.5156,0.9939], [0.5469,0.9919], [0.5781,0.9532], [0.6094,0.8571], [0.6406,0.67], [0.6719,0.4596], [0.7031,0.4435], [0.7344,0.4818], [0.7656,0.485], [0.7969,0.4382], [0.8281,0.3701], [0.8594,0.3326], [0.8906,0.3313], [0.9219,0.3895], [0.9531,0.3751], [0.9844,0.3593], [1,0.2581]]
    },
    nikka_coffey: {
      name: 'Nikka Coffey', asp: 3.15, yFull: 0.71, pourable: true,
      // La de Nikka Coffey Grain. 554 px de alto por 176 de ancho maximo,
      // desajuste de area 0.53 %. Recta, hombro del 64 % al 77 %, cuello
      // recto. yFull .71 medida viendo el liquido en la foto, justo debajo
      // de la franja de vidrio vacio.
      p: [[0,0.6496], [0.0156,0.8763], [0.0469,0.983], [0.0781,0.9773], [0.1094,0.9773], [0.1406,0.9773], [0.1719,0.9836], [0.2031,0.9886], [0.2344,0.9886], [0.2656,0.9886], [0.2969,0.9886], [0.3281,0.9886], [0.3594,0.9886], [0.3906,0.9933], [0.4219,0.9943], [0.4531,0.9943], [0.4844,0.9943], [0.5156,0.995], [0.5469,1], [0.5781,1], [0.6094,1], [0.6406,0.9923], [0.6719,0.9391], [0.7031,0.8145], [0.7344,0.5521], [0.7656,0.3952], [0.7969,0.3864], [0.8281,0.381], [0.8594,0.3737], [0.8906,0.3832], [0.9219,0.4071], [0.9531,0.4017], [0.9844,0.3783], [1,0.303]]
    },
    grey_goose: {
      name: 'Grey Goose', asp: 4.46, yFull: 0.68, pourable: true,
      // La de Grey Goose. 1000 px de alto por 224 de ancho maximo. La foto
      // traia un escalon a media botella: de la mitad para abajo salia un
      // 7 % mas ancha, de golpe, en unas 30 filas. Es del recorte, no de
      // la botella, y Axel lo vio en la lamina: "debe ser continuo". Se
      // eligio entre dos arreglos dibujados; el suyo es este, el cuerpo
      // que se estrecha en linea recta de la base (r 1) al arranque del
      // hombro (r .928, lo medido ahi). Desajuste de area contra la foto
      // 1.98 %, casi todo el escalon que se quito.
      //
      // Hombro del 59 % al 69 %, cuello largo. El vidrio esmerilado no deja
      // ver el liquido: yFull .68 sigue el criterio de botanist.
      p: [[0,0.994], [0.0156,0.9994], [0.0469,1], [0.0781,0.9958], [0.1094,0.9915], [0.1406,0.9873], [0.1719,0.9831], [0.2031,0.9788], [0.2344,0.9746], [0.2656,0.9704], [0.2969,0.9661], [0.3281,0.9619], [0.3594,0.9576], [0.3906,0.9534], [0.4219,0.9492], [0.4531,0.9449], [0.4844,0.9407], [0.5156,0.9365], [0.5469,0.9322], [0.5781,0.928], [0.6094,0.8874], [0.6406,0.729], [0.6719,0.4726], [0.7031,0.3807], [0.7344,0.375], [0.7656,0.3664], [0.7969,0.3661], [0.8281,0.3635], [0.8594,0.3511], [0.8906,0.3478], [0.9219,0.3584], [0.9531,0.3687], [0.9844,0.3167], [1,0.1354]]
    },
    ciroc: {
      name: 'Cîroc', asp: 4.47, yFull: 0.81, pourable: true,
      // La de Ciroc (foto del Apple; los sabores comparten botella y solo
      // cambia el color). 554 px de alto por 124 de ancho maximo, desajuste
      // de area 0.73 %. Se estrecha poco a poco desde la base y cierra con
      // un hombro brusco al 80 %: por eso la linea va tan alta. Vidrio
      // esmerilado, el liquido no se ve: yFull .81 por el criterio de
      // botanist.
      p: [[0,0.414], [0.0156,0.8015], [0.0469,1], [0.0781,1], [0.1094,1], [0.1406,0.9962], [0.1719,0.9853], [0.2031,0.9824], [0.2344,0.9758], [0.2656,0.9696], [0.2969,0.9592], [0.3281,0.9462], [0.3594,0.9355], [0.3906,0.9317], [0.4219,0.9274], [0.4531,0.9194], [0.4844,0.9122], [0.5156,0.9075], [0.5469,0.9032], [0.5781,0.8952], [0.6094,0.8871], [0.6406,0.8838], [0.6719,0.879], [0.7031,0.87], [0.7344,0.8629], [0.7656,0.8566], [0.7969,0.8373], [0.8281,0.5389], [0.8594,0.4379], [0.8906,0.4413], [0.9219,0.463], [0.9531,0.4597], [0.9844,0.444], [1,0.3522]]
    },
    whistlepig: {
      name: 'WhistlePig', asp: 2.05, yFull: 0.72, pourable: true,
      // La de WhistlePig 10. 554 px de alto por 270 de ancho maximo,
      // desajuste de area 0.57 %. Baja y redonda, hombro del 58 % al 75 %,
      // cuello corto. yFull .72 medida viendo el liquido en la foto.
      p: [[0,0.5642], [0.0156,0.6792], [0.0469,0.7691], [0.0781,0.7963], [0.1094,0.8128], [0.1406,0.8425], [0.1719,0.8695], [0.2031,0.8871], [0.2344,0.9041], [0.2656,0.9222], [0.2969,0.9414], [0.3281,0.9535], [0.3594,0.9603], [0.3906,0.9691], [0.4219,0.9776], [0.4531,0.985], [0.4844,0.9913], [0.5156,0.9939], [0.5469,0.9996], [0.5781,0.993], [0.6094,0.981], [0.6406,0.9425], [0.6719,0.8652], [0.7031,0.7172], [0.7344,0.4157], [0.7656,0.2988], [0.7969,0.2963], [0.8281,0.2952], [0.8594,0.2943], [0.8906,0.2977], [0.9219,0.3272], [0.9531,0.3394], [0.9844,0.3131], [1,0.1951]]
    },
    chivas: {
      name: 'Chivas Regal', asp: 2.67, yFull: 0.75, pourable: true,
      // La de Chivas Regal 12. 872 px de alto por 326 de ancho maximo,
      // desajuste de area 0.68 %. Hombro redondo y ancho del 48 % al 64 %,
      // cuello con la etiqueta roja. yFull .75 medida viendo el liquido en
      // la foto: se ve hasta debajo de esa etiqueta.
      p: [[0,0.4622], [0.0156,0.8466], [0.0469,0.9773], [0.0781,0.9663], [0.1094,0.9705], [0.1406,0.9724], [0.1719,0.9749], [0.2031,0.9785], [0.2344,0.9785], [0.2656,0.9805], [0.2969,0.9847], [0.3281,0.9847], [0.3594,0.9847], [0.3906,0.99], [0.4219,0.9962], [0.4531,0.9989], [0.4844,0.9978], [0.5156,0.9701], [0.5469,0.9041], [0.5781,0.7842], [0.6094,0.5969], [0.6406,0.4431], [0.6719,0.4394], [0.7031,0.4612], [0.7344,0.4485], [0.7656,0.4155], [0.7969,0.3807], [0.8281,0.3491], [0.8594,0.3447], [0.8906,0.3483], [0.9219,0.3499], [0.9531,0.3458], [0.9844,0.334], [1,0.2843]]
    },
    empress: {
      name: 'Empress 1908', asp: 3.29, yFull: 0.72, pourable: true,
      // La de Empress 1908. 543 px de alto por 165 de ancho maximo,
      // desajuste de area 0.90 %. Recta, hombro corto del 67 % al 73 %.
      // yFull .72 medida viendo el liquido (morado) en la foto: llega
      // justo a donde empieza el cuello, que esta vacio.
      p: [[0,0.4364], [0.0156,0.7508], [0.0469,0.9465], [0.0781,0.9793], [0.1094,0.9793], [0.1406,0.9818], [0.1719,0.9818], [0.2031,0.9857], [0.2344,0.9879], [0.2656,0.9879], [0.2969,0.9868], [0.3281,0.9818], [0.3594,0.9818], [0.3906,0.9818], [0.4219,0.9818], [0.4531,0.9818], [0.4844,0.9864], [0.5156,0.9936], [0.5469,0.9943], [0.5781,1], [0.6094,0.9932], [0.6406,0.9857], [0.6719,0.9551], [0.7031,0.7045], [0.7344,0.3676], [0.7656,0.354], [0.7969,0.3558], [0.8281,0.3601], [0.8594,0.3636], [0.8906,0.3679], [0.9219,0.3882], [0.9531,0.3754], [0.9844,0.3239], [1,0.1333]]
    },
    disaronno: {
      name: 'Disaronno', asp: 2.06, yFull: 0.72, pourable: true,
      // La de Disaronno. Se midio primero de una foto CORTADA, sin el
      // tapon: salia chata (1.76) y con la linea al 82 %. Axel lo vio en la
      // lamina y mando la foto entera. Esta es de esa: JPG con fondo
      // blanco, sin canal alfa; el alfa se hizo rellenando el blanco desde
      // las esquinas. 606 px de alto por 294 de ancho maximo, desajuste
      // de area 0.65 %.
      //
      // Cuadrada, tratada como redonda igual que Red Label. Cintura muy
      // suave (un 3 %), que es de la botella y es continua; hombro del 64 %
      // al 75 % y el tapon cuadrado, mas ancho que el cuello. yFull .72
      // medida viendo el liquido en la foto.
      p: [[0,0.8946], [0.0156,0.9298], [0.0469,0.9744], [0.0781,0.9932], [0.1094,0.9959], [0.1406,0.9939], [0.1719,0.9891], [0.2031,0.983], [0.2344,0.9803], [0.2656,0.9792], [0.2969,0.9771], [0.3281,0.9752], [0.3594,0.9737], [0.3906,0.9731], [0.4219,0.9703], [0.4531,0.9705], [0.4844,0.969], [0.5156,0.9692], [0.5469,0.9742], [0.5781,0.9757], [0.6094,0.9814], [0.6406,0.9868], [0.6719,0.9618], [0.7031,0.8435], [0.7344,0.4651], [0.7656,0.2902], [0.7969,0.275], [0.8281,0.2719], [0.8594,0.358], [0.8906,0.538], [0.9219,0.5383], [0.9531,0.5378], [0.9844,0.5325], [1,0.5147]]
    },
    jameson: {
      name: 'Jameson', asp: 3.98, yFull: 0.7, pourable: true,
      // La de Jameson. 864 px de alto por 217 de ancho maximo. La foto tenia
      // dos defectos: abajo, entre el 8 % y el 15 %, el recorte se comia el
      // borde izquierdo (donde va el 1780 en relieve), y el cuerpo salia
      // con ondas. Con lo que Axel pidio para Grey Goose ("debe ser
      // continuo"), el cuerpo es una recta ajustada por minimos cuadrados
      // en el tramo limpio, del 20 % al 60 %, y prolongada hasta la base:
      // se abre de r .91 a .98 hacia el hombro. Desajuste de area 1.41 %.
      //
      // Hombro del 61 % al 70 %. El vidrio verde no deja ver el liquido:
      // yFull .70 sigue el criterio de botanist.
      p: [[0,0.1905], [0.0156,0.6377], [0.0469,0.9104], [0.0781,0.9145], [0.1094,0.9186], [0.1406,0.9226], [0.1719,0.9267], [0.2031,0.9308], [0.2344,0.9348], [0.2656,0.9389], [0.2969,0.943], [0.3281,0.947], [0.3594,0.9511], [0.3906,0.9551], [0.4219,0.9592], [0.4531,0.9633], [0.4844,0.9673], [0.5156,0.9714], [0.5469,0.9755], [0.5781,0.9795], [0.6094,0.9836], [0.6406,0.9541], [0.6719,0.7797], [0.7031,0.488], [0.7344,0.4194], [0.7656,0.4054], [0.7969,0.397], [0.8281,0.3847], [0.8594,0.3821], [0.8906,0.3825], [0.9219,0.377], [0.9531,0.3767], [0.9844,0.3644], [1,0.2673]]
    },
    tullamore: {
      name: "Tullamore D.E.W.", asp: 2.72, yFull: 0.75, pourable: true,
      // La de Tullamore D.E.W. (foto de la de 1.75 L). 992 px de alto por
      // 365 de ancho maximo. En la foto el ancho del cuerpo iba y venia un
      // 5 % (de 348 a 365 px) por la perspectiva del render; con lo que
      // Axel pidio para Grey Goose ("debe ser continuo"), el cuerpo es una
      // recta ajustada por minimos cuadrados del 8 % al 62 %: se abre un
      // poco hacia la base, de r .96 a 1. Desajuste de area 1.34 %.
      //
      // Hombro del 64 % al 77 %. yFull .75 medida viendo el liquido en la
      // foto, justo debajo del cuello vacio.
      p: [[0,0.358], [0.0156,0.6886], [0.0469,0.935], [0.0781,0.9964], [0.1094,0.9941], [0.1406,0.9917], [0.1719,0.9893], [0.2031,0.987], [0.2344,0.9846], [0.2656,0.9823], [0.2969,0.9799], [0.3281,0.9775], [0.3594,0.9752], [0.3906,0.9728], [0.4219,0.9704], [0.4531,0.9681], [0.4844,0.9657], [0.5156,0.9634], [0.5469,0.961], [0.5781,0.9586], [0.6094,0.9563], [0.6406,0.954], [0.6719,0.8884], [0.7031,0.7219], [0.7344,0.4771], [0.7656,0.3703], [0.7969,0.3176], [0.8281,0.2838], [0.8594,0.2884], [0.8906,0.2849], [0.9219,0.2856], [0.9531,0.2862], [0.9844,0.2624], [1,0.1571]]
    },
    elijah_craig: {
      name: "Elijah Craig", asp: 2.51, yFull: 0.72, pourable: true,
      // La de Elijah Craig. 978 px de alto por 390 de ancho maximo,
      // desajuste de area 0.74 %. Mas angosta en la base (r .82) y ancha en
      // los hombros: es de la botella, no de la foto, y es continua.
      // Hombro del 55 % al 73 %. yFull .72 medida viendo el liquido en la
      // foto.
      p: [[0,0.4778], [0.0156,0.7456], [0.0469,0.8208], [0.0781,0.8363], [0.1094,0.8545], [0.1406,0.8685], [0.1719,0.8842], [0.2031,0.9006], [0.2344,0.9159], [0.2656,0.9318], [0.2969,0.9473], [0.3281,0.9602], [0.3594,0.9749], [0.3906,0.9892], [0.4219,0.9992], [0.4531,1], [0.4844,1], [0.5156,0.9988], [0.5469,0.9872], [0.5781,0.962], [0.6094,0.9122], [0.6406,0.8289], [0.6719,0.704], [0.7031,0.5247], [0.7344,0.3932], [0.7656,0.3341], [0.7969,0.2917], [0.8281,0.277], [0.8594,0.2774], [0.8906,0.3267], [0.9219,0.4097], [0.9531,0.3999], [0.9844,0.3481], [1,0.1838]]
    },
    don_julio_blanco: {
      // La clave se queda (ya hay productos guardados con ella), pero la
      // botella es la de 1.75 L: la de 750 resulto otra (ver `don_julio`).
      // Ver BY_SIZE: con menos de 1.5 L esta clave se dibuja como la de 750.
      name: "Don Julio · 1.75 L", asp: 1.56, yFull: 0.65, pourable: true,
      // La de Don Julio Blanco (foto de la de 1.75 L): la botella redonda,
      // que no se parece a la del Anejo. 998 px de alto por 641 de ancho
      // maximo, desajuste de area 0.60 %. Cuerpo redondo que se cierra del
      // 33 % al 66 %, cuello recto y el tapon de madera. El tequila es
      // transparente y no se ve: yFull .65 por el criterio de botanist.
      p: [[0,0.1846], [0.0156,0.4374], [0.0469,0.6647], [0.0781,0.7664], [0.1094,0.8329], [0.1406,0.8869], [0.1719,0.9292], [0.2031,0.9597], [0.2344,0.9818], [0.2656,0.9935], [0.2969,0.9993], [0.3281,0.9993], [0.3594,0.9921], [0.3906,0.9792], [0.4219,0.9603], [0.4531,0.9342], [0.4844,0.8969], [0.5156,0.8453], [0.5469,0.7769], [0.5781,0.6871], [0.6094,0.5579], [0.6406,0.3651], [0.6719,0.2788], [0.7031,0.2692], [0.7344,0.2699], [0.7656,0.2699], [0.7969,0.2692], [0.8281,0.3095], [0.8594,0.3808], [0.8906,0.3508], [0.9219,0.3718], [0.9531,0.3483], [0.9844,0.2381], [1,0.0764]]
    },
    michters: {
      name: "Michter's", asp: 3.28, yFull: 0.63, pourable: true,
      // La de Michter's US*1. 996 px de alto por 304 de ancho maximo,
      // desajuste de area 0.76 %. El centro de las filas se mueve arriba
      // por el liston verde del cuello; el cuerpo esta centrado. Hombro del
      // 52 % al 63 %, cuello largo. Las etiquetas de papel tapan el cuello
      // hasta el 63 % y justo debajo ya hay liquido: yFull .63 por el
      // criterio de botanist.
      p: [[0,0.7204], [0.0156,0.8834], [0.0469,0.9829], [0.0781,0.9817], [0.1094,0.977], [0.1406,0.977], [0.1719,0.977], [0.2031,0.977], [0.2344,0.977], [0.2656,0.9805], [0.2969,0.972], [0.3281,0.9585], [0.3594,0.9792], [0.3906,0.9868], [0.4219,0.9913], [0.4531,0.9995], [0.4844,1], [0.5156,0.9823], [0.5469,0.9076], [0.5781,0.7242], [0.6094,0.4828], [0.6406,0.41], [0.6719,0.4051], [0.7031,0.3966], [0.7344,0.3997], [0.7656,0.3883], [0.7969,0.3719], [0.8281,0.3716], [0.8594,0.4096], [0.8906,0.3905], [0.9219,0.3716], [0.9531,0.3594], [0.9844,0.3098], [1,0.0976]]
    },
    basil_hayden: {
      name: "Basil Hayden", asp: 3.92, yFull: 0.7, pourable: true,
      // La de Basil Hayden. 992 px de alto. La foto trae la etiqueta de
      // cobre colgando a la derecha y la banda sobresaliendo a la
      // izquierda: se midio el lado izquierdo desde el eje del cuello,
      // saltando la banda (del 25 % al 42 %), y el cuerpo es una recta por
      // minimos cuadrados del 6 % al 58 %, que se abre un poco hacia el
      // hombro. Desajuste de area 3.32 %, casi todo de la banda que se dejo
      // fuera. Hombro del 58 % al 70 %. yFull .70 medida viendo el liquido
      // en la foto, debajo de la etiqueta del cuello.
      p: [[0,0.9442], [0.0156,0.9442], [0.0469,0.9442], [0.0781,0.9461], [0.1094,0.9495], [0.1406,0.9528], [0.1719,0.9562], [0.2031,0.9596], [0.2344,0.963], [0.2656,0.9663], [0.2969,0.9697], [0.3281,0.973], [0.3594,0.9765], [0.3906,0.9798], [0.4219,0.9832], [0.4531,0.9865], [0.4844,0.9899], [0.5156,0.9933], [0.5469,0.9967], [0.5781,1], [0.6094,0.9097], [0.6406,0.7275], [0.6719,0.4919], [0.7031,0.4237], [0.7344,0.4079], [0.7656,0.3965], [0.7969,0.3847], [0.8281,0.3751], [0.8594,0.3644], [0.8906,0.3776], [0.9219,0.3779], [0.9531,0.3883], [0.9844,0.3822], [1,0.1382]]
    },
    skrewball: {
      name: "Skrewball", asp: 3.37, yFull: 0.75, pourable: true,
      // La de Skrewball. La primera foto traia la etiqueta sobresaliendo y
      // un lado mal recortado, y de ahi salio un cilindro recto que Axel
      // rechazo ("estan mal disenadas"). Esta es de la segunda: JPG con
      // fondo blanco, la mascara va fila por fila del primer al ultimo
      // pixel que no es fondo. 550 px de alto por 163 de ancho maximo,
      // desajuste de area 0.95 %. Se angosta hacia la base (r .88), hombro
      // del 49 % al 62 %, cuello largo. yFull .75 medida viendo el liquido,
      // ya en el cuello.
      p: [[0,0.3742], [0.0156,0.7209], [0.0469,0.8802], [0.0781,0.8885], [0.1094,0.8943], [0.1406,0.9109], [0.1719,0.9127], [0.2031,0.9179], [0.2344,0.9257], [0.2656,0.9365], [0.2969,0.9423], [0.3281,0.9473], [0.3594,0.961], [0.3906,0.9673], [0.4219,0.9765], [0.4531,0.982], [0.4844,0.9917], [0.5156,0.9657], [0.5469,0.8759], [0.5781,0.6795], [0.6094,0.424], [0.6406,0.354], [0.6719,0.3374], [0.7031,0.3374], [0.7344,0.332], [0.7656,0.3223], [0.7969,0.319], [0.8281,0.3194], [0.8594,0.3165], [0.8906,0.3176], [0.9219,0.3212], [0.9531,0.3197], [0.9844,0.3136], [1,0.2025]]
    },
    malibu: {
      name: "Malibu", asp: 3.51, yFull: 0.74, pourable: true,
      // La de Malibu. Tambien de una segunda foto, tras rechazar la primera.
      // Botella blanca sobre fondo blanco: el hombro izquierdo no se
      // distingue del fondo, asi que se midio el borde derecho, limpio en
      // toda la altura, y se reflejo sobre el eje (x 164, fijo de arriba a
      // abajo). 1140 px de alto, desajuste de area 0.73 %. Cintura suave a
      // un tercio de la altura y hombro largo y caido del 58 % al 77 %. Es
      // opaca: yFull .74 por el criterio de botanist.
      p: [[0,0.3538], [0.0156,0.7436], [0.0469,0.9168], [0.0781,0.9676], [0.1094,0.9901], [0.1406,0.9919], [0.1719,0.9834], [0.2031,0.9759], [0.2344,0.9699], [0.2656,0.9588], [0.2969,0.9525], [0.3281,0.9446], [0.3594,0.9475], [0.3906,0.9508], [0.4219,0.9595], [0.4531,0.9703], [0.4844,0.9793], [0.5156,0.9933], [0.5469,0.9938], [0.5781,0.9694], [0.6094,0.8615], [0.6406,0.7082], [0.6719,0.5803], [0.7031,0.4866], [0.7344,0.4219], [0.7656,0.3873], [0.7969,0.379], [0.8281,0.3757], [0.8594,0.3756], [0.8906,0.394], [0.9219,0.3955], [0.9531,0.3844], [0.9844,0.3693], [1,0.2636]]
    },
    dewars: {
      name: "Dewar's", asp: 4.09, yFull: 0.78, pourable: true,
      // La de Dewar's White Label. Tambien de una segunda foto (JPG con
      // fondo blanco). En la primera se le habia quitado el pie; es de la
      // botella y se queda. 446 px de alto por 109 de ancho maximo,
      // desajuste de area 0.93 %; la tapa toca el borde de la foto y le
      // puede faltar algun pixel. Ancha en el hombro, se angosta hacia la
      // base y el pie se abre otra vez. yFull .78 medida viendo el liquido,
      // hasta la etiqueta roja del cuello.
      p: [[0,0.6086], [0.0156,0.8571], [0.0469,0.9882], [0.0781,0.9515], [0.1094,0.9155], [0.1406,0.8997], [0.1719,0.8991], [0.2031,0.8991], [0.2344,0.8991], [0.2656,0.9004], [0.2969,0.9102], [0.3281,0.916], [0.3594,0.9174], [0.3906,0.9312], [0.4219,0.9391], [0.4531,0.9482], [0.4844,0.9561], [0.5156,0.9633], [0.5469,0.9797], [0.5781,0.983], [0.6094,0.9902], [0.6406,0.9528], [0.6719,0.8363], [0.7031,0.6022], [0.7344,0.5098], [0.7656,0.5131], [0.7969,0.4705], [0.8281,0.4227], [0.8594,0.3709], [0.8906,0.3834], [0.9219,0.3965], [0.9531,0.3912], [0.9844,0.386], [1,0.3517]]
    },
    bulleit: {
      name: 'Bulleit', asp: 2.46, yFull: 0.74, pourable: true,
      // La de Bulleit. JPG con fondo blanco: la mascara va fila por fila,
      // del primer al ultimo pixel que no es fondo. 554 px de alto por 225
      // de ancho maximo, desajuste de area 0.65 %. Ancha y baja, hombro
      // casi cuadrado del 70 % al 80 %, cuello corto. yFull .74 medida
      // viendo el liquido en la foto.
      p: [[0,0.5185], [0.0156,0.8351], [0.0469,0.9446], [0.0781,0.9386], [0.1094,0.9499], [0.1406,0.9556], [0.1719,0.9556], [0.2031,0.9631], [0.2344,0.9644], [0.2656,0.9668], [0.2969,0.9663], [0.3281,0.9686], [0.3594,0.9733], [0.3906,0.9754], [0.4219,0.9822], [0.4531,0.9822], [0.4844,0.9822], [0.5156,0.9875], [0.5469,0.9911], [0.5781,0.9942], [0.6094,1], [0.6406,1], [0.6719,0.9946], [0.7031,0.9566], [0.7344,0.8708], [0.7656,0.6773], [0.7969,0.3427], [0.8281,0.2837], [0.8594,0.3043], [0.8906,0.3133], [0.9219,0.3156], [0.9531,0.3022], [0.9844,0.2905], [1,0.2059]]
    },
    buffalo_trace: {
      name: 'Buffalo Trace', asp: 2.9, yFull: 0.72, pourable: true,
      // La de Buffalo Trace. WEBP con fondo blanco, misma mascara. 1078 px
      // de alto por 372 de ancho maximo, desajuste de area 0.77 %. Un poco
      // mas angosta abajo, hombro redondo del 52 % al 64 % y cuello con
      // anillo. yFull .72 medida viendo el liquido, ya en el cuello.
      p: [[0,0.4122], [0.0156,0.7438], [0.0469,0.9396], [0.0781,0.9375], [0.1094,0.8918], [0.1406,0.8944], [0.1719,0.9031], [0.2031,0.9132], [0.2344,0.9232], [0.2656,0.9329], [0.2969,0.94], [0.3281,0.9497], [0.3594,0.9584], [0.3906,0.969], [0.4219,0.9806], [0.4531,0.9898], [0.4844,0.9957], [0.5156,0.9845], [0.5469,0.9317], [0.5781,0.7815], [0.6094,0.5568], [0.6406,0.4043], [0.6719,0.388], [0.7031,0.4222], [0.7344,0.4196], [0.7656,0.3883], [0.7969,0.3529], [0.8281,0.3179], [0.8594,0.3208], [0.8906,0.3231], [0.9219,0.3088], [0.9531,0.2994], [0.9844,0.3039], [1,0.1935]]
    },
    bols: {
      name: 'Bols', asp: 3.55, yFull: 0.69, pourable: true,
      // La de los licores Bols (foto del Blue Curacao). WEBP con fondo
      // blanco. 898 px de alto por 253 de ancho maximo, desajuste de area
      // 0.89 %. Una campana: se abre abajo y sube en cono del 27 % al 70 %
      // hasta el cuello. yFull .69 medida viendo el azul en la foto; mas
      // arriba lo tapa la etiqueta del cuello.
      p: [[0,0.2279], [0.0156,0.6343], [0.0469,0.8584], [0.0781,0.8909], [0.1094,0.918], [0.1406,0.9442], [0.1719,0.9681], [0.2031,0.9884], [0.2344,0.9994], [0.2656,0.9977], [0.2969,0.9774], [0.3281,0.9561], [0.3594,0.9219], [0.3906,0.8759], [0.4219,0.7976], [0.4531,0.7316], [0.4844,0.6698], [0.5156,0.6084], [0.5469,0.5597], [0.5781,0.5165], [0.6094,0.4788], [0.6406,0.4496], [0.6719,0.4259], [0.7031,0.415], [0.7344,0.4067], [0.7656,0.3962], [0.7969,0.3855], [0.8281,0.3751], [0.8594,0.3607], [0.8906,0.3636], [0.9219,0.3615], [0.9531,0.3624], [0.9844,0.3403], [1,0.191]]
    },
    bacardi: {
      name: 'Bacardí', asp: 4.13, yFull: 0.71, pourable: true,
      // La de Bacardi Superior. JPG con fondo blanco y vidrio transparente.
      // La foto trae la sombra del piso pegada a la base, un ovalo gris
      // claro (227-232) que con el umbral de siempre (235) salia como un
      // ensanche. Esas filas (la base) se midieron con 215; el resto con
      // 235, porque con 215 el borde del vidrio claro se perdia en medio
      // cuerpo (desajuste 6.2 %). 971 px de alto, desajuste de area 0.91 %.
      // Recta y alta, hombro del 64 % al 73 %. El ron es transparente:
      // yFull .71 por el criterio de botanist.
      p: [[0,0.261], [0.0156,0.7735], [0.0469,0.961], [0.0781,0.9526], [0.1094,0.9341], [0.1406,0.9311], [0.1719,0.9332], [0.2031,0.9366], [0.2344,0.9406], [0.2656,0.9447], [0.2969,0.9507], [0.3281,0.9529], [0.3594,0.9539], [0.3906,0.9553], [0.4219,0.9599], [0.4531,0.961], [0.4844,0.9609], [0.5156,0.9643], [0.5469,0.9633], [0.5781,0.9657], [0.6094,0.9841], [0.6406,0.9942], [0.6719,0.9262], [0.7031,0.6386], [0.7344,0.4226], [0.7656,0.4018], [0.7969,0.4011], [0.8281,0.402], [0.8594,0.4], [0.8906,0.3999], [0.9219,0.3942], [0.9531,0.3946], [0.9844,0.3763], [1,0.173]]
    },
    t1800: {
      name: '1800 Reposado', asp: 2.61, yFull: 0.74, pourable: true,
      // La de 1800 Reposado. JPG con fondo blanco: la mascara va fila por
      // fila, del primer al ultimo pixel que no es fondo. 447 px de alto
      // por 171 de ancho maximo, desajuste de area 0.81 %. Botella de
      // cuatro caras (tratada como redonda, como Red Label) que se abre
      // hacia la base, hombro del 70 % al 77 % y la tapa dorada mas ancha
      // que el cuello. yFull .74 medida viendo el liquido; mas arriba lo
      // tapa la etiqueta del cuello.
      p: [[0,0.8655], [0.0156,0.9261], [0.0469,0.9933], [0.0781,0.9871], [0.1094,0.9804], [0.1406,0.9607], [0.1719,0.9511], [0.2031,0.9332], [0.2344,0.9231], [0.2656,0.9106], [0.2969,0.8981], [0.3281,0.8872], [0.3594,0.8776], [0.3906,0.8684], [0.4219,0.8534], [0.4531,0.8434], [0.4844,0.8349], [0.5156,0.8275], [0.5469,0.8145], [0.5781,0.8041], [0.6094,0.7966], [0.6406,0.7849], [0.6719,0.7698], [0.7031,0.7302], [0.7344,0.5113], [0.7656,0.3158], [0.7969,0.3037], [0.8281,0.3033], [0.8594,0.312], [0.8906,0.444], [0.9219,0.4854], [0.9531,0.4854], [0.9844,0.4395], [1,0.2885]]
    },
    v360: {
      name: '360', asp: 3.94, yFull: 0.73, pourable: true,
      // La de 360 Vodka (foto del Double Chocolate). Vidrio transparente
      // sobre blanco: el borde izquierdo se perdia a media altura y se midio
      // el derecho, reflejado sobre el eje. El cierre de alambre del cuello
      // (swing-top) sobresale por los dos lados y se recorto al ancho del
      // cuello: no es vidrio ni guarda liquido, como el asa de Carlo Rossi.
      //
      // La foto daba un escalon al 40 % (la parte de abajo un 9 % mas
      // ancha) y se tomo por real porque salia igual a los dos lados. Axel:
      // "le pusiste un bump y no lleva". El cuerpo es recto, con el ancho de
      // abajo, donde el borde se ve limpio; contra la foto el desajuste es
      // 3.34 %, casi todo ese escalon. Es transparente: yFull .73 por el
      // criterio de botanist.
      p: [[0,0.5321], [0.0156,0.7959], [0.0469,0.963], [0.0781,0.9586], [0.1094,1], [0.1406,1], [0.1719,1], [0.2031,1], [0.2344,1], [0.2656,1], [0.2969,1], [0.3281,1], [0.3594,1], [0.3906,1], [0.4219,1], [0.4531,1], [0.4844,1], [0.5156,1], [0.5469,1], [0.5781,1], [0.6094,1], [0.6406,0.96], [0.6719,0.8536], [0.7031,0.774], [0.7344,0.5518], [0.7656,0.3787], [0.7969,0.3654], [0.8281,0.3609], [0.8594,0.3654], [0.8906,0.3654], [0.9219,0.3654], [0.9531,0.3654], [0.9844,0.3654], [1,0.3397]]
    },
    frangelico: {
      name: 'Frangelico', asp: 3.38, yFull: 0.83, pourable: true,
      // La de Frangelico, el monje. El cordon cuelga por la derecha y se
      // midio el lado izquierdo, reflejado sobre el eje del cuello. 554 px
      // de alto, desajuste de area 1.41 %. La base se abre como el habito,
      // la cintura donde va el cordon es angosta y la capucha, encima, es
      // mas ancha: ese escalon es de la botella. yFull .83 medida viendo el
      // liquido, ya en el cuello.
      p: [[0,0.3577], [0.0156,0.7825], [0.0469,0.9785], [0.0781,0.9634], [0.1094,0.9465], [0.1406,0.9247], [0.1719,0.9082], [0.2031,0.8852], [0.2344,0.8659], [0.2656,0.8465], [0.2969,0.8286], [0.3281,0.8035], [0.3594,0.7862], [0.3906,0.7712], [0.4219,0.7554], [0.4531,0.7188], [0.4844,0.7647], [0.5156,0.9448], [0.5469,0.9925], [0.5781,0.9498], [0.6094,0.9053], [0.6406,0.8594], [0.6719,0.8137], [0.7031,0.7661], [0.7344,0.7217], [0.7656,0.6755], [0.7969,0.5674], [0.8281,0.3357], [0.8594,0.33], [0.8906,0.3449], [0.9219,0.3544], [0.9531,0.3644], [0.9844,0.3293], [1,0.1423]]
    },
    st_elder: {
      name: 'St. Elder', asp: 3.79, yFull: 0.78, pourable: true,
      // La de St. Elder. 424 px de alto, desajuste de area 0.93 %. Recta,
      // hombro corto del 70 % al 77 %. yFull .78 medida viendo el liquido,
      // que llega al cuello debajo de la capsula verde.
      p: [[0,0.3929], [0.0156,0.8036], [0.0469,0.9835], [0.0781,0.9725], [0.1094,0.9176], [0.1406,0.8897], [0.1719,0.897], [0.2031,0.9011], [0.2344,0.9018], [0.2656,0.9107], [0.2969,0.9196], [0.3281,0.921], [0.3594,0.9272], [0.3906,0.9334], [0.4219,0.9375], [0.4531,0.9444], [0.4844,0.9554], [0.5156,0.9554], [0.5469,0.9615], [0.5781,0.9649], [0.6094,0.9725], [0.6406,0.9746], [0.6719,0.9815], [0.7031,0.9483], [0.7344,0.671], [0.7656,0.4258], [0.7969,0.3819], [0.8281,0.3757], [0.8594,0.375], [0.8906,0.375], [0.9219,0.3709], [0.9531,0.3777], [0.9844,0.3626], [1,0.3274]]
    },
    st_germain: {
      name: 'St-Germain', asp: 3.78, yFull: 0.84, pourable: true,
      // La de St-Germain. 552 px de alto. Primero se hizo con los 34 puntos
      // parejos de siempre y Axel la quiso con "mas detalles": esos puntos
      // se comian el filo del hombro y el pellizco del cuello. Esta lleva
      // 57 puntos puestos donde la forma cambia (Douglas-Peucker sobre la
      // medida fila por fila, mediana de 5 filas, tolerancia .008), y el
      // desajuste baja de 1.13 % a 0.59 %. El pie un poco mas ancho, la
      // cintura larga, el hombro en corona casi en punta al 75 %, el
      // pellizco del cuello al 88 % y la tapa mas ancha que el cuello. Las
      // facetas del vidrio no salen: no cambian el contorno.
      // yFull .84 medida viendo el liquido, casi hasta la tapa.
      p: [[0,0.411], [0.0018,0.5137], [0.0036,0.5137], [0.0054,0.6712], [0.0073,0.7877], [0.0091,0.8151], [0.02,0.8425], [0.1089,0.8014], [0.2432,0.774], [0.265,0.7808], [0.274,0.7671], [0.4301,0.774], [0.4319,0.7877], [0.4755,0.7877], [0.5336,0.8151], [0.5535,0.8356], [0.5789,0.8356], [0.5826,0.8493], [0.5953,0.8493], [0.6007,0.863], [0.6171,0.863], [0.6207,0.8767], [0.6534,0.8904], [0.6588,0.911], [0.6951,0.9315], [0.7078,0.9589], [0.726,0.9658], [0.7405,0.9932], [0.755,1], [0.7804,0.9658], [0.7822,0.9521], [0.8004,0.9178], [0.8076,0.8836], [0.8149,0.8767], [0.8221,0.8288], [0.8276,0.8288], [0.8312,0.7877], [0.8385,0.7603], [0.8439,0.7055], [0.8566,0.6096], [0.8639,0.5274], [0.8657,0.4932], [0.8675,0.4932], [0.8693,0.4726], [0.8711,0.4041], [0.8748,0.3493], [0.8784,0.3493], [0.882,0.3973], [0.8857,0.4178], [0.9583,0.4452], [0.9619,0.4589], [0.9691,0.4589], [0.9855,0.5], [0.9927,0.5], [0.9946,0.4795], [0.9964,0.4315], [1,0.4247]]
    },
    mozart: {
      name: 'Mozart', asp: 1.45, yFull: 0.66, pourable: true,
      // La de los licores Mozart (foto del White Chocolate): la bola con el
      // cuello largo. 554 px de alto, desajuste de area 0.67 %. El papel
      // dorado no deja ver el liquido: yFull .66 por el criterio de
      // botanist, donde la bola se cierra en el cuello.
      p: [[0,0.2663], [0.0156,0.5762], [0.0469,0.697], [0.0781,0.7073], [0.1094,0.78], [0.1406,0.8444], [0.1719,0.8956], [0.2031,0.934], [0.2344,0.9629], [0.2656,0.9848], [0.2969,0.9966], [0.3281,1], [0.3594,0.9977], [0.3906,0.9862], [0.4219,0.969], [0.4531,0.943], [0.4844,0.9118], [0.5156,0.8678], [0.5469,0.804], [0.5781,0.7255], [0.6094,0.6337], [0.6406,0.515], [0.6719,0.3738], [0.7031,0.3211], [0.7344,0.3211], [0.7656,0.3211], [0.7969,0.3179], [0.8281,0.3185], [0.8594,0.3182], [0.8906,0.3159], [0.9219,0.3139], [0.9531,0.3133], [0.9844,0.3], [1,0.2037]]
    },
    two_gingers: {
      name: '2 Gingers', asp: 3.79, yFull: 0.79, pourable: true,
      // La de 2 Gingers (foto de la de 1 L). WEBP con fondo blanco: la
      // mascara va fila por fila, del primer al ultimo pixel que no es
      // fondo. 917 px de alto, desajuste de area 0.61 %. Recta, hombro
      // corto del 58 % al 68 %, cuello largo. yFull .79 medida viendo el
      // liquido, que sube hasta el cuello.
      p: [[0,0.9105], [0.0156,0.9144], [0.0469,0.9823], [0.0781,0.9929], [0.1094,0.9833], [0.1406,0.9803], [0.1719,0.9787], [0.2031,0.9805], [0.2344,0.9798], [0.2656,0.9793], [0.2969,0.9812], [0.3281,0.9836], [0.3594,0.9835], [0.3906,0.9835], [0.4219,0.9835], [0.4531,0.9843], [0.4844,0.9836], [0.5156,0.9882], [0.5469,0.9944], [0.5781,0.9612], [0.6094,0.8618], [0.6406,0.675], [0.6719,0.4727], [0.7031,0.4544], [0.7344,0.4613], [0.7656,0.4456], [0.7969,0.4184], [0.8281,0.374], [0.8594,0.315], [0.8906,0.3319], [0.9219,0.3498], [0.9531,0.3482], [0.9844,0.3377], [1,0.2245]]
    },
    averna: {
      name: 'Averna', asp: 4.5, yFull: 0.76, pourable: true,
      // La de Averna. JPG con fondo blanco, 554 px de alto, desajuste de
      // area 0.91 %. Alta y delgada, con un pie un poco mas ancho en la base
      // (es de la botella), hombro del 70 % al 77 %. yFull .76 medida viendo
      // el liquido oscuro, debajo de la franja clara bajo la tapa.
      p: [[0,0.5149], [0.0156,0.8284], [0.0469,0.9923], [0.0781,0.9756], [0.1094,0.9264], [0.1406,0.9024], [0.1719,0.9024], [0.2031,0.9115], [0.2344,0.9164], [0.2656,0.9225], [0.2969,0.9268], [0.3281,0.9268], [0.3594,0.9297], [0.3906,0.9378], [0.4219,0.9536], [0.4531,0.9557], [0.4844,0.9598], [0.5156,0.9675], [0.5469,0.9675], [0.5781,0.9708], [0.6094,0.9794], [0.6406,0.9837], [0.6719,0.9887], [0.7031,0.9837], [0.7344,0.7054], [0.7656,0.4679], [0.7969,0.4314], [0.8281,0.4409], [0.8594,0.4371], [0.8906,0.4309], [0.9219,0.4333], [0.9531,0.4261], [0.9844,0.4237], [1,0.3279]]
    },
    baileys: {
      name: 'Baileys', asp: 3.28, yFull: 0.7, pourable: true,
      // La de Baileys (foto de la de 1 L). WEBP con fondo blanco, 1036 px de
      // alto, desajuste de area 0.67-0.70 %. Se abre desde la base hasta un
      // hombro largo y caido, del 52 % al 72 %, cuello largo. Vidrio negro:
      // yFull .70 por el criterio de botanist.
      p: [[0,0.2447], [0.0156,0.6995], [0.0469,0.8752], [0.0781,0.8835], [0.1094,0.8909], [0.1406,0.9007], [0.1719,0.9079], [0.2031,0.9186], [0.2344,0.9255], [0.2656,0.9327], [0.2969,0.9434], [0.3281,0.9508], [0.3594,0.961], [0.3906,0.9686], [0.4219,0.9762], [0.4531,0.987], [0.4844,0.9938], [0.5156,0.9967], [0.5469,0.9601], [0.5781,0.8594], [0.6094,0.7265], [0.6406,0.5863], [0.6719,0.4551], [0.7031,0.3674], [0.7344,0.3312], [0.7656,0.3214], [0.7969,0.3167], [0.8281,0.3228], [0.8594,0.3228], [0.8906,0.3228], [0.9219,0.3196], [0.9531,0.3146], [0.9844,0.3005], [1,0.1688]]
    },
    blade_and_bow: {
      name: 'Blade and Bow', asp: 2.33, yFull: 0.63, pourable: true,
      // La de Blade and Bow. JPG con fondo blanco. La llave cuelga a la
      // derecha (del 63 % al 71 %) y se midio el lado izquierdo, reflejado
      // sobre el eje del cuello. 541 px de alto, desajuste de area 0.96 %.
      // Cuadrada (tratada como redonda, como Red Label), ancha y baja, base
      // biselada, hombro corto del 58 % al 66 %. yFull .63 medida viendo el
      // liquido, que llega al final del hombro: el cuello va vacio.
      p: [[0,0.3966], [0.0156,0.6009], [0.0469,0.7541], [0.0781,0.82], [0.1094,0.8859], [0.1406,0.8889], [0.1719,0.8991], [0.2031,0.9077], [0.2344,0.9138], [0.2656,0.9224], [0.2969,0.9295], [0.3281,0.9371], [0.3594,0.9437], [0.3906,0.9523], [0.4219,0.9604], [0.4531,0.967], [0.4844,0.9758], [0.5156,0.9828], [0.5469,0.9904], [0.5781,0.9706], [0.6094,0.6947], [0.6406,0.4579], [0.6719,0.36], [0.7031,0.3342], [0.7344,0.3222], [0.7656,0.3256], [0.7969,0.3235], [0.8281,0.319], [0.8594,0.3124], [0.8906,0.3256], [0.9219,0.3311], [0.9531,0.3362], [0.9844,0.2996], [1,0.1322]]
    },
    don_julio: {
      name: "Don Julio", asp: 1.73, yFull: 0.66, pourable: true,
      // La de Don Julio Blanco y Reposado de 750 ml (foto del Reposado).
      // JPG con fondo blanco, 554 px de alto, desajuste de area 0.56 %.
      // Primero se midio el Blanco de una foto de 1.75 L y se asumio que el
      // 750 era la misma botella; no lo es: el de 750 tiene la base plana y
      // ancha (1.73) y el de 1.75 L es casi una esfera (1.56). La de 1.75 L
      // sigue en `don_julio_blanco` y BY_SIZE elige entre las dos por el
      // tamano, como con las magnums de vino. El nivel lo tapa la etiqueta
      // del cuello: yFull .66 por el hombro, como la de 1.75 L.
      p: [[0,0.7917], [0.0156,0.8875], [0.0469,0.9807], [0.0781,0.9996], [0.1094,0.9993], [0.1406,0.9938], [0.1719,0.9893], [0.2031,0.9857], [0.2344,0.9804], [0.2656,0.975], [0.2969,0.9697], [0.3281,0.9632], [0.3594,0.9568], [0.3906,0.9531], [0.4219,0.9437], [0.4531,0.9259], [0.4844,0.8945], [0.5156,0.8485], [0.5469,0.7866], [0.5781,0.7072], [0.6094,0.5971], [0.6406,0.4312], [0.6719,0.3142], [0.7031,0.2993], [0.7344,0.3024], [0.7656,0.3031], [0.7969,0.3015], [0.8281,0.3498], [0.8594,0.4232], [0.8906,0.3976], [0.9219,0.4184], [0.9531,0.3925], [0.9844,0.2792], [1,0.1354]]
    },
    buchanans: {
      name: "Buchanan's", asp: 2.04, yFull: 0.66, pourable: true,
      // La de Buchanan's 12 (Deluxe). JPG con fondo blanco, 416 px de alto,
      // desajuste de area 0.64 %. Ancha y de esquinas redondas. Los dos
      // sellos rojos de los costados (del 27 % al 43 %) no son vidrio y
      // dejaban un bulto: en esas filas el borde va en linea recta entre el
      // de debajo y el de encima. Vidrio verde: yFull .66 por el hombro.
      p: [[0,0.4837], [0.0156,0.6735], [0.0469,0.8646], [0.0781,0.9329], [0.1094,0.9657], [0.1406,0.9804], [0.1719,0.9891], [0.2031,0.9936], [0.2344,0.9996], [0.2656,1], [0.2969,0.9996], [0.3281,0.9951], [0.3594,0.991], [0.3906,0.9876], [0.4219,0.9853], [0.4531,0.9853], [0.4844,0.9815], [0.5156,0.9695], [0.5469,0.948], [0.5781,0.911], [0.6094,0.845], [0.6406,0.7025], [0.6719,0.4529], [0.7031,0.3273], [0.7344,0.2998], [0.7656,0.3186], [0.7969,0.3092], [0.8281,0.3088], [0.8594,0.3088], [0.8906,0.3296], [0.9219,0.3164], [0.9531,0.3096], [0.9844,0.306], [1,0.219]]
    },
    campari: {
      name: "Campari", asp: 4.04, yFull: 0.76, pourable: true,
      // La de Campari (foto del litro). WEBP con fondo blanco, 1047 px de
      // alto, desajuste de area 0.92 %. Recta, con un pie un poco mas ancho,
      // hombro del 64 % al 77 %. yFull .76 medida viendo el rojo, debajo de
      // la franja clara bajo la tapa.
      p: [[0,0.3346], [0.0156,0.8652], [0.0469,0.9961], [0.0781,0.9726], [0.1094,0.9653], [0.1406,0.9617], [0.1719,0.9624], [0.2031,0.9654], [0.2344,0.9634], [0.2656,0.9651], [0.2969,0.9643], [0.3281,0.9663], [0.3594,0.9665], [0.3906,0.9663], [0.4219,0.9691], [0.4531,0.9736], [0.4844,0.9767], [0.5156,0.9743], [0.5469,0.9764], [0.5781,0.9798], [0.6094,0.9827], [0.6406,0.9868], [0.6719,0.9415], [0.7031,0.7891], [0.7344,0.5023], [0.7656,0.4068], [0.7969,0.3855], [0.8281,0.3757], [0.8594,0.373], [0.8906,0.3708], [0.9219,0.3763], [0.9531,0.3676], [0.9844,0.3542], [1,0.1236]]
    },
    captain_morgan: {
      name: "Captain Morgan", asp: 4.06, yFull: 0.74, pourable: true,
      // La de Captain Morgan Spiced. JPG con fondo blanco, 548 px de alto,
      // desajuste de area 0.81 %. Recta y alta, hombro corto del 61 % al
      // 73 %. yFull .74 medida viendo el liquido, debajo del cuello vacio.
      p: [[0,0.4123], [0.0156,0.7745], [0.0469,0.9769], [0.0781,0.9991], [0.1094,0.9839], [0.1406,0.9708], [0.1719,0.9699], [0.2031,0.9704], [0.2344,0.9704], [0.2656,0.9708], [0.2969,0.9704], [0.3281,0.9704], [0.3594,0.9704], [0.3906,0.9704], [0.4219,0.9704], [0.4531,0.9704], [0.4844,0.9704], [0.5156,0.9704], [0.5469,0.9621], [0.5781,0.963], [0.6094,0.98], [0.6406,0.8532], [0.6719,0.6436], [0.7031,0.4654], [0.7344,0.4222], [0.7656,0.4022], [0.7969,0.3922], [0.8281,0.3926], [0.8594,0.3926], [0.8906,0.3983], [0.9219,0.4052], [0.9531,0.4], [0.9844,0.3782], [1,0.2864]]
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
    wine_burgundy: [[1500, 'wine_magnum']],
    // Don Julio Blanco/Reposado: la de 750 y la de 1.75 L son botellas
    // distintas. Y los productos a los que ya se les puso la de 1.75 L
    // (`don_julio_blanco`) siendo de 750 se corrigen solos aqui, por su
    // tamano, sin tocar lo guardado.
    don_julio:        [[1500, 'don_julio_blanco']],
    don_julio_blanco: [[0, 'don_julio'], [1500, 'don_julio_blanco']]
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

  // ── El asa ───────────────────────────────────────────────────────────
  //
  // Un adorno que se DIBUJA y no CUENTA: va aparte de `p`, así que ni
  // radiusAt ni el volumen la ven. Nace del cuerpo y vuelve a él —el
  // contorno empieza y acaba en el borde de la silueta— y el hueco queda
  // entre el asa y el cuello. El primer intento la cerraba sin tocar el
  // cuello y salía suelta. Misma caja que `pathFor`, siempre a la
  // derecha. Sin asa, cadena vacía: quien dibuja no tiene que preguntar.
  function asaFor(x, w, h, pad) {
    const prof = profOf(x);
    const A = prof && prof.asa;
    if (!A || !Array.isArray(A.borde) || A.borde.length < 2) return '';
    const { maxR, usable, cx, base } = boxFor(x, w, h, pad);
    const P = ([y, r]) => (cx + r * maxR).toFixed(2) + ' ' + (base - y * usable).toFixed(2);
    const bo = A.borde, it = Array.isArray(A.interior) ? A.interior : [];
    const yT = bo[0][0], yB = bo[bo.length - 1][0];
    let seq = [[yT, radiusAt(x, yT)]].concat(bo, [[yB, radiusAt(x, yB)]]);
    if (it.length >= 2) {
      const hT = it[0][0], hB = it[it.length - 1][0];
      seq = seq.concat([[hB, radiusAt(x, hB)]], it.slice().reverse(), [[hT, radiusAt(x, hT)]]);
    }
    return 'M ' + seq.map(P).join(' L ') + ' Z';
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
    pathFor, asaFor, yToPx, boxFor, isValidProfile,
    radiusAt, volumeTo, fractionAt, heightFor
  };
})();
