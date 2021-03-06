const fsx = require('fs-extra');
const path = require('path');

function render (template, data, customFilters={}) {
  const defaultFilters = {
    lowCase: function(string) {
      return string.toLowerCase();
    }
  };
  const filters = Object.assign({}, defaultFilters, customFilters);
  const renderFunction = genFun(template, data, filters);
  return renderFunction(data, filters);
}


function dealFilter (stmJs) {
  let res = '';
  stmJs.split('|').forEach((item, index) => {
    if(index === 0) {
      res = item;
    } else {
      let filter = item.split(':');
      res = `FILTERS['${filter[0].trim()}'](${res}`;
      if (filter[1]) {
        filter[1].split(',').forEach((para) => {
          res = `${res}, ${para}`;
        })
      }
      res = `${res})`;
    }
  })
  return res;
}


function parse (template) {
  const templateString = [];
  let beg = 0;
  let len = template.length;
  let stmbeg = 0;
  let stmend = 0;
  let preCode = '';
  let endCode = '';
  let stmJs = '';

  while(beg < len) {
    stmbeg = template.indexOf('{', beg);
    if(stmbeg === -1) {
      endCode = template.substr(beg);
      templateString.push(`html.push('${endCode}');`);
      break;
    }

    stmend = template.indexOf('}', stmbeg);
    if(stmend === -1) {
      break;
    }

    preCode = template.substring(beg, stmbeg);
    if(template.charAt(stmbeg + 1) === '$') {
      templateString.push(`html.push('${preCode.substr(0, preCode.length)}');`);
      stmJs = template.substring(stmbeg + 1, stmend);
      let filtered = dealFilter(stmJs);
      templateString.push(`html.push(${filtered}.toString());`);
    } else {
      templateString.push(`html.push('${preCode}');`);
      stmJs = template.substring(stmbeg + 1, stmend);
      templateString.push(`${transStm(stmJs)}`);
    }
    beg = stmend + 1;
  }
  return templateString;
}

function including (all, file) {
  const includingTemplate = fsx.readFileSync(path.resolve(file), 'utf8');
  const html = render(includingTemplate, {}, {});
  return `html.push('${html}');`;
}

const regmap = [
  {reg: /^if\s+(.+)/i, val: (all, condition) => {return `if(${condition}) {`;}},
  {reg: /^elseif\s+(.+)/i, val: (all, condition) => {return `} else if(${condition}) {`}},
  {reg: /^else/i, val: '} else {'},
  {reg: /^\/\s*if/i, val: '}'},
  {reg: /^foreach\s+([\S]+)\s+as\s+([\S]+)/i, val: (all, arr, item) => {return `for(var __INDEX__=0;__INDEX__<${arr}.length;__INDEX__++) {var ${item}=${arr}[__INDEX__];var ${item}_index=__INDEX__;`;}},
  {reg: /^\/\s*foreach/i, val: '}'},
  {reg: /^var\s+(.+)/i, val: (all, expr) => {return `var ${expr};`;}},
  {reg: /^include\s+file\s*=\s*['"](.*)['"]/i, val: including},
];

function transStm (stmJs) {
  stmJs = stmJs.trim();
  for(let item of regmap) {
    if (item.reg.test(stmJs)) {
      return (typeof item.val === 'function') ? stmJs.replace(item.reg, item.val) : item.val;
    }
  }
}

function genFun(template, data, filters) {

  const functionString = [
    `try { var html = [];`,
    '',
    `return html.join(''); } catch(e) { throw e; }`,
  ];

  const templateString = parse(template);

  const valuesString = [];
  Object.keys(data).forEach((name) => {
    valuesString.push(`var $${name} = DATA['${name}'];`)
  });

  const filtersString = ['var FILTERS = {};'];
  Object.keys(filters).forEach((name) => {
    filtersString.push(`FILTERS['${name}'] = FILTER['${name}'];`)
  })

  functionString[1] = valuesString.concat(filtersString).concat(templateString).join('');
  return new Function('DATA', 'FILTER', functionString.join(''));
};

module.exports = genFun;