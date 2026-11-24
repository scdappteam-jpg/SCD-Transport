// SpreadsheetML permits either default or explicitly prefixed element names.
function normalize(xml) {
    let result=xml;
    const namespaces=/\bxmlns:([A-Za-z_][\w.-]*)\s*=\s*(["'])(?:http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main|http:\/\/purl\.oclc\.org\/ooxml\/spreadsheetml\/main)\2/g;
    for(const match of xml.matchAll(namespaces)){
        const prefix=match[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        result=result.replace(new RegExp('<(/?)'+prefix+':','g'),'<$1');
    }
    return result;
}
module.exports={normalize};
