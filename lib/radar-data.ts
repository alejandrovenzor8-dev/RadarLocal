export type Category = { id:string; slug:string; name:string; icon:string; color:string };
export type Business = { id:string; slug:string; name:string; categoryId:string; shortDescription:string; city:string; state:string; zone:string; rating:number|null; reviewCount:number; verified:boolean; featured:boolean; demoData:true; services:string[]; tags:string[]; sourceUrl:string; imageUrl:string; imageSource:string; cover:string };

// El orden de categorías viene del estudio del proyecto. Los negocios son ejemplos documentados, no un ranking propio.
export const categories:Category[] = [
  {id:"food",slug:"restaurantes",name:"Restaurantes",icon:"Utensils",color:"#C65B35"},
  {id:"realestate",slug:"inmobiliarias",name:"Inmobiliarias",icon:"House",color:"#2D6B8C"},
  {id:"events",slug:"salones-de-eventos",name:"Salones de eventos",icon:"PartyPopper",color:"#9563A9"},
  {id:"wine",slug:"vinos",name:"Vinos",icon:"Wine",color:"#8B3857"},
];

const entries = [
  ["food","Mochomos Chihuahua","Distrito Uno","Cocina sonorense de autor, cortes y mariscos en Distrito Uno.","https://www.mochomos.mx/","/businesses/mochomos.jpg","https://reservandonos.com/lugar/restaurante-mochomos-chihuahua/","Restaurante|Cortes|Reservaciones"],
  ["food","Great American Steakhouse Chihuahua","Periférico de la Juventud","Cortes, panadería, bar y espacios para reuniones.","https://greatamericansteakhouse.com/locations/chihuahua.php","/businesses/great-american.jpg","https://greatamericansteakhouse.com/locations/chihuahua.php","Restaurante|Cortes|Eventos privados"],
  ["realestate","CENTURY 21 Census","Cumbres","Asesoría para comprar, vender o rentar inmuebles en Chihuahua.","https://www.century21global.com/en/offices/CENTURY-21-Census--rl-100208196","/businesses/century21.jpg","https://century21mexico.com/en_us/propiedad/551144_terreno-en-en_usventa-en-colonia-mexico-chihuahua-chihuahua-mexico","Compra|Venta|Renta"],
  ["realestate","Five Bienes Raíces","Zona norte","Oferta de vivienda y asesoría inmobiliaria en Chihuahua.","https://www.fivebienesraices.com.mx/","/businesses/five-bienes-raices.jpg","https://www.fivebienesraices.com.mx/property/casa-en-venta-en-residencial-leones-residencial-el-leon-chihuahua","Compra|Venta|Asesoría"],
  ["events","Hacienda Ángeles","Aeropuerto","Jardín, salón y terraza para celebraciones en Chihuahua.","https://www.bodas.com.mx/haciendas-para-bodas/hacienda-angeles--e159715","/businesses/hacienda-angeles.jpg","https://quintaluceros.com.mx/s239-hacienda-angeles/","Bodas|Eventos sociales|Banquetes"],
  ["events","Campestre de Chihuahua","Campestre","Salón y terraza para bodas y eventos con vista al campo de golf.","https://campestrechihuahua.mx/salones-de-eventos/salon-campestre/","/businesses/campestre.jpg","https://campestrechihuahua.mx/salones-de-eventos/salon-campestre/","Bodas|Salón|Banquetes"],
  ["wine","Bodegas Pinesque","Municipio de Chihuahua","Vinos chihuahuenses de autor, visitas y catas en bodega.","https://www.pinesque.com/pages/nosotros","/businesses/pinesque.jpg","https://www.pinesque.com/pages/tours","Vinos|Catas|Visitas"],
  ["wine","Vinos Encinillas","Valle de Encinillas","Vinos elaborados en el Valle de Encinillas, Chihuahua.","https://www.vinosencinillas.com/","/businesses/encinillas.jpg","https://forbes.com.mx/forbes-life/vinos-encinillas-referente-del-potencial-vitivinicola-de-chihuahua/","Vinos|Viñedo|Enoturismo"],
] as const;

export const businesses:Business[] = entries.map((e,i)=>({
  id:`${e[0]}-${i+1}`,slug:e[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""),name:e[1],categoryId:e[0],shortDescription:e[3],city:"Chihuahua",state:"Chihuahua",zone:e[2],rating:null,reviewCount:0,verified:false,featured:i%2===0,demoData:true,services:e[7].split("|"),tags:[categories.find(c=>c.id===e[0])!.name,e[1],...e[7].split("|")],sourceUrl:e[4],imageUrl:e[5],imageSource:e[6],cover:`cover-${e[0]}-${i%2+1}`
}));

export const promotions=[
  {id:"p1",business:"Mochomos Chihuahua",title:"Una cena especial para descubrir",valid:"Ejemplo sin vigencia real",category:"food"},
  {id:"p2",business:"CENTURY 21 Census",title:"Asesoría para tu próxima propiedad",valid:"Ejemplo sin vigencia real",category:"realestate"},
  {id:"p3",business:"Hacienda Ángeles",title:"Planea tu próximo evento",valid:"Ejemplo sin vigencia real",category:"events"},
  {id:"p4",business:"Bodegas Pinesque",title:"Conoce el vino de Chihuahua",valid:"Ejemplo sin vigencia real",category:"wine"},
];
export const activity=[{day:"1 sep",visits:44,contacts:8},{day:"5 sep",visits:58,contacts:11},{day:"9 sep",visits:50,contacts:9},{day:"13 sep",visits:72,contacts:14},{day:"17 sep",visits:83,contacts:18},{day:"21 sep",visits:76,contacts:15},{day:"25 sep",visits:96,contacts:22},{day:"30 sep",visits:112,contacts:26}];
