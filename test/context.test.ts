/**
 * 上下文索引测试工具
 * 
 * 用于验证 Java/C++ 多文件支持是否正确实现
 */

import * as path from 'path';
import * as fs from 'fs';
import { SymbolIndex, DEFAULT_INDEX_CONFIG } from './src/context/symbolIndex';
import { CodeGraph } from './src/context/codeGraph';
import { ContextManager } from './src/context/contextManager';

async function testJavaFixtures() {
    console.log('=== Testing Java Fixtures ===');
    
    const javaFixturePath = path.join(__dirname, '..', 'fixtures', 'java');
    if (!fs.existsSync(javaFixturePath)) {
        console.error('Java fixtures not found!');
        return;
    }
    
    const config = {
        ...DEFAULT_INDEX_CONFIG,
        includePatterns: ['**/*.java']
    };
    
    const index = new SymbolIndex(config);
    await index.indexDirectory(javaFixturePath);
    
    const stats = index.getStats();
    console.log('Java Stats:', stats);
    
    const symbols = index.getAllSymbols();
    console.log('\nFound symbols:');
    symbols.forEach(symbol => {
        console.log(`  - ${symbol.kind}: ${symbol.name} in ${path.basename(symbol.filePath)}`);
    });
    
    // 测试 CodeGraph
    const graph = new CodeGraph();
    const files = fs.readdirSync(javaFixturePath)
        .filter(f => f.endsWith('.java'))
        .map(f => path.join(javaFixturePath, f));
    
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        graph.addFile(file, content);
    }
    
    const inheritances = graph.getInheritanceRelations();
    console.log('\nInheritance relations:');
    inheritances.forEach(rel => {
        console.log(`  - ${rel.child} ${rel.type} ${rel.parent}`);
    });
    
    const imports = graph.getImports();
    console.log('\nImport relations:');
    imports.forEach(imp => {
        console.log(`  - ${path.basename(imp.sourceFile)} imports ${imp.importedSymbols.join(', ')}`);
    });
}

async function testCppFixtures() {
    console.log('\n=== Testing C++ Fixtures ===');
    
    const cppFixturePath = path.join(__dirname, '..', 'fixtures', 'cpp');
    if (!fs.existsSync(cppFixturePath)) {
        console.error('C++ fixtures not found!');
        return;
    }
    
    const config = {
        ...DEFAULT_INDEX_CONFIG,
        includePatterns: ['**/*.cpp', '**/*.h', '**/*.hpp']
    };
    
    const index = new SymbolIndex(config);
    await index.indexDirectory(cppFixturePath);
    
    const stats = index.getStats();
    console.log('C++ Stats:', stats);
    
    const symbols = index.getAllSymbols();
    console.log('\nFound symbols:');
    symbols.forEach(symbol => {
        console.log(`  - ${symbol.kind}: ${symbol.name} in ${path.basename(symbol.filePath)}`);
    });
    
    // 测试 CodeGraph
    const graph = new CodeGraph();
    const files = fs.readdirSync(cppFixturePath)
        .filter(f => f.endsWith('.cpp') || f.endsWith('.h'))
        .map(f => path.join(cppFixturePath, f));
    
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        graph.addFile(file, content);
    }
    
    const inheritances = graph.getInheritanceRelations();
    console.log('\nInheritance relations:');
    inheritances.forEach(rel => {
        console.log(`  - ${rel.child} ${rel.type} ${rel.parent}`);
    });
    
    const imports = graph.getImports();
    console.log('\nImport relations (includes):');
    imports.forEach(imp => {
        console.log(`  - ${path.basename(imp.sourceFile)} includes ${path.basename(imp.targetFile)}`);
    });
}

async function testContextManager() {
    console.log('\n=== Testing ContextManager ===');
    
    const javaFixturePath = path.join(__dirname, '..', 'fixtures', 'java');
    const manager = new ContextManager(javaFixturePath);
    await manager.initialize();
    
    const context = manager.getFullContext();
    console.log('Language:', context.language);
    console.log('Entry points:', context.entryPoints);
    console.log('Config files:', context.configFiles);
    console.log('Project overview:', context.projectOverview);
}

async function runAllTests() {
    try {
        await testJavaFixtures();
        await testCppFixtures();
        await testContextManager();
        console.log('\n✅ All tests completed!');
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

runAllTests();
