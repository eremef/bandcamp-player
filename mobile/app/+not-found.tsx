import { Link, Stack, useRouter } from 'expo-router';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useEffect } from 'react';

export default function NotFoundScreen() {
    const router = useRouter();

    useEffect(() => {
        // Automatically redirect to home after a brief delay
        // This handles the case where a notification opens a weird route
        const timer = setTimeout(() => {
            router.replace('/');
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <>
            <Stack.Screen options={{ title: 'Loading...' }} />
            <View style={styles.container}>
                <Text style={styles.title}>Resuming specific route...</Text>
                <TouchableOpacity onPress={() => router.replace('/')} style={styles.link}>
                    <Text style={styles.linkText}>Go Home</Text>
                </TouchableOpacity>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backgroundColor: '#1e1e1e',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 20,
    },
    link: {
        marginTop: 15,
        paddingVertical: 15,
    },
    linkText: {
        fontSize: 14,
        color: '#1db954',
    },
});
